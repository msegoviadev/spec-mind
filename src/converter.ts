import type { OpenAPIV3 } from '@apidevtools/swagger-parser'
import { renderField, renderNamedSchema, renderSchemaType, refName } from './emitter'
import { compactType } from './typeMap'
import type { ConvertOptions, RefCounts } from './types'

type Document = OpenAPIV3.Document
type OperationObject = OpenAPIV3.OperationObject
type SchemaObject = OpenAPIV3.SchemaObject
type ReferenceObject = OpenAPIV3.ReferenceObject
type ParameterObject = OpenAPIV3.ParameterObject
type ResponseObject = OpenAPIV3.ResponseObject
type HeaderObject = OpenAPIV3.HeaderObject
type SecuritySchemeObject = OpenAPIV3.SecuritySchemeObject

const NOTATION_LEGEND = `# NOTATION: ? optional  [ro] readOnly  [w] writeOnly  =val default
#           ^ header  ~cookie  *N multipleOf N  | enum or nullable
#           OneOf<A,B> on field = discriminated union
#           {*:T} = map/dict  {...} = open object  extends = allOf
#           & = inline extension  ~~name~~ = deprecated  # = inline note
#           [multipart] [form] [binary] [text] = request body encoding`

// ── Public entry ─────────────────────────────────────────────────────────────

export function convert(doc: Document, opts: ConvertOptions): string {
  const schemas = (doc.components?.schemas || {}) as Record<string, SchemaObject>
  const refCounts = countRefs(doc)

  const lines: string[] = []

  // Header
  lines.push('# COMPACT INDEX — navigational summary only. Do not derive contracts from this file.')
  lines.push(`# Source: ${opts.sourcePath} | Generated: ${opts.generatedAt} | Spec version: ${doc.info.version}`)

  const baseUrl = resolveServerUrl(doc)
  lines.push(`# API: ${doc.info.title} — ${baseUrl}`)

  if (!opts.noNotation) {
    lines.push(NOTATION_LEGEND)
  }

  lines.push('')

  // Global auth
  const globalAuthTag = renderGlobalAuth(doc)
  if (globalAuthTag) {
    lines.push(globalAuthTag)
    lines.push('')
  }

  // Endpoints grouped by tag
  const groups = groupByTag(doc)
  for (const [tag, ops] of groups) {
    lines.push(`## ${tag}`)
    for (const { method, path, operation } of ops) {
      lines.push(...renderOperation(method, path, operation, doc, globalAuthTag, refCounts, schemas))
      lines.push('')
    }
  }

  // Schemas
  const schemaNames = Object.keys(schemas)
  if (schemaNames.length > 0) {
    lines.push('## Schemas')
    const maxLen = Math.max(...schemaNames.map(n => n.length))
    const colWidth = maxLen + 2
    for (const name of schemaNames) {
      const schema = schemas[name]
      if (!schema) continue
      const line = renderNamedSchema(name, schema, refCounts, schemas)
      // pad "name:" to colWidth, then append the rest after the colon
      const colon = line.indexOf(':')
      if (colon !== -1) {
        const nameWithColon = line.slice(0, colon + 1)
        const rest = line.slice(colon + 1).trimStart()
        lines.push(`${nameWithColon.padEnd(colWidth)}${rest}`)
      } else {
        lines.push(line)
      }
    }
  }

  return lines.join('\n') + '\n'
}

// ── Server URL ────────────────────────────────────────────────────────────────

function resolveServerUrl(doc: Document): string {
  const servers = doc.servers
  if (!servers || servers.length === 0) return ''

  let url = servers[0].url
  const vars = servers[0].variables || {}

  for (const [key, varDef] of Object.entries(vars)) {
    const replacement = varDef.default ?? `{${key}}`
    url = url.replace(`{${key}}`, replacement)
  }

  return url
}

// ── Reference counting ────────────────────────────────────────────────────────

function countRefs(doc: Document): RefCounts {
  const counts: RefCounts = {}
  const visited = new WeakSet()
  walkRefs(doc as unknown as Record<string, unknown>, counts, visited)
  return counts
}

function walkRefs(
  obj: unknown,
  counts: RefCounts,
  visited: WeakSet<object>
): void {
  if (!obj || typeof obj !== 'object') return
  if (visited.has(obj as object)) return
  visited.add(obj as object)

  if (Array.isArray(obj)) {
    for (const item of obj) walkRefs(item, counts, visited)
    return
  }

  const rec = obj as Record<string, unknown>
  if ('$ref' in rec && typeof rec['$ref'] === 'string') {
    const ref = rec['$ref'] as string
    if (ref.startsWith('#/components/schemas/')) {
      const name = ref.split('/').pop()!
      counts[name] = (counts[name] || 0) + 1
    }
    return
  }

  for (const val of Object.values(rec)) walkRefs(val, counts, visited)
}

// ── Auth ──────────────────────────────────────────────────────────────────────

function renderGlobalAuth(doc: Document): string {
  const security = doc.security
  if (!security || security.length === 0) return ''

  const schemes = (doc.components?.securitySchemes || {}) as Record<string, SecuritySchemeObject>
  const first = security[0]
  const entries = Object.entries(first)
  if (entries.length === 0) return ''
  const [schemeName, scopes] = entries[0]
  const scheme = schemes[schemeName]
  if (!scheme) return ''

  return `[auth: ${formatAuthScheme(scheme, scopes as string[])}]`
}

function formatAuthScheme(scheme: SecuritySchemeObject, scopes: string[]): string {
  if (scheme.type === 'http') {
    return scheme.scheme === 'bearer' ? 'bearer' : scheme.scheme
  }
  if (scheme.type === 'oauth2') {
    return scopes.length > 0 ? `oauth2 ${scopes.join(',')}` : 'oauth2'
  }
  if (scheme.type === 'apiKey') {
    const loc = scheme.in
    const name = scheme.name
    return `apikey ${loc} ${name}`
  }
  return scheme.type
}

function renderOperationAuth(
  operation: OperationObject,
  doc: Document,
  globalAuthTag: string
): string {
  const opSecurity = operation.security
  if (opSecurity === undefined) return ''

  if (opSecurity.length === 0) return '  [auth: none]'

  const schemes = (doc.components?.securitySchemes || {}) as Record<string, SecuritySchemeObject>
  const first = opSecurity[0]
  const entries = Object.entries(first)
  if (entries.length === 0) return ''
  const [schemeName, scopes] = entries[0]
  const scheme = schemes[schemeName]
  if (!scheme) return ''

  const authStr = formatAuthScheme(scheme, scopes as string[])
  const fullAuthTag = `[auth: ${authStr}]`

  if (fullAuthTag === globalAuthTag) return ''

  return `  ${fullAuthTag}`
}

// ── Tag grouping ──────────────────────────────────────────────────────────────

interface OpEntry {
  method: string
  path: string
  operation: OperationObject
}

function groupByTag(doc: Document): Map<string, OpEntry[]> {
  const groups = new Map<string, OpEntry[]>()

  const paths = doc.paths || {}
  for (const [path, pathItem] of Object.entries(paths)) {
    if (!pathItem) continue
    const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const
    for (const method of methods) {
      const operation = (pathItem as any)[method] as OperationObject | undefined
      if (!operation) continue

      const tag = operation.tags?.[0] || '(untagged)'
      if (!groups.has(tag)) groups.set(tag, [])
      groups.get(tag)!.push({ method: method.toUpperCase(), path, operation })
    }
  }

  return groups
}

// ── Path annotation ───────────────────────────────────────────────────────────

function annotatePath(path: string, params: ParameterObject[]): string {
  return path.replace(/\{([^}]+)\}/g, (match, paramName) => {
    const param = params.find(p => p.in === 'path' && p.name === paramName)
    if (!param) return match
    const schema = (param.schema || {}) as SchemaObject
    const typeStr = compactType(schema as any)
    if (!typeStr) return match
    return `{${paramName}${typeStr}}`
  })
}

// ── Operation rendering ───────────────────────────────────────────────────────

function renderOperation(
  method: string,
  path: string,
  operation: OperationObject,
  doc: Document,
  globalAuthTag: string,
  refCounts: RefCounts,
  schemas: Record<string, SchemaObject>
): string[] {
  const lines: string[] = []
  const deprecated = operation.deprecated ? '~~' : ''
  const methodStr = deprecated ? `~~${method}~~` : method

  const params = (operation.parameters || []) as ParameterObject[]
  const annotatedPath = annotatePath(path, params)

  // content-type flag
  const contentTypeFlag = requestContentTypeFlag(operation)

  // auth override
  const opAuth = renderOperationAuth(operation, doc, globalAuthTag)

  const methodLine = `${methodStr} ${annotatedPath}${contentTypeFlag ? `  ${contentTypeFlag}` : ''}${opAuth}`
  lines.push(methodLine)

  // parameters
  const paramLine = renderParams(params, schemas)
  if (paramLine) lines.push(`  ${paramLine}`)

  // request body
  const bodyLine = renderBody(operation, refCounts, schemas)
  if (bodyLine) lines.push(`  body: ${bodyLine}`)

  // responses
  const responses = operation.responses || {}
  const sortedCodes = Object.keys(responses).sort((a, b) => {
    const na = parseInt(a), nb = parseInt(b)
    return na - nb
  })

  // group codes with same body shape
  const codeGroups = groupResponseCodes(sortedCodes, responses, refCounts, schemas)
  for (const { codes, body, headers } of codeGroups) {
    const codeStr = codes.join(',')
    const bodyStr = body ? `: ${body}` : ''
    lines.push(`  -> ${codeStr}${bodyStr}`)
    if (headers) {
      lines.push(`     headers: ${headers}`)
    }
  }

  return lines
}

// ── Content type flag ─────────────────────────────────────────────────────────

function requestContentTypeFlag(operation: OperationObject): string {
  const body = operation.requestBody as any
  if (!body) return ''
  const content = body.content || {}
  const mediaTypes = Object.keys(content)

  if (mediaTypes.includes('multipart/form-data')) return '[multipart]'
  if (mediaTypes.includes('application/x-www-form-urlencoded')) return '[form]'
  if (mediaTypes.includes('application/octet-stream')) return '[binary]'
  if (mediaTypes.includes('text/plain')) return '[text]'

  return ''
}

// ── Parameters ────────────────────────────────────────────────────────────────

function renderParams(params: ParameterObject[], schemas: Record<string, SchemaObject>): string {
  const parts: string[] = []

  // path params with extra constraints only
  for (const p of params.filter(p => p.in === 'path')) {
    const schema = (p.schema || {}) as SchemaObject
    const hasExtra = schema.pattern || schema.minLength !== undefined || schema.maxLength !== undefined
    if (!hasExtra) continue
    parts.push(renderParam(p, schemas))
  }

  // query, header, cookie in order
  for (const loc of ['query', 'header', 'cookie'] as const) {
    for (const p of params.filter(p => p.in === loc)) {
      parts.push(renderParam(p, schemas))
    }
  }

  return parts.join(', ')
}

function renderParam(p: ParameterObject, schemas: Record<string, SchemaObject>): string {
  const prefix = p.in === 'header' ? '^' : p.in === 'cookie' ? '~' : ''
  const optional = !p.required ? '?' : ''
  const schema = (p.schema || {}) as SchemaObject
  const deprecated = p.deprecated ? '~~' : ''

  const name = deprecated ? `~~${p.name}~~` : p.name

  const typeStr = compactType(schema as any)

  // enum in param
  if (schema.enum) {
    const vals = schema.enum.join('|')
    const base = typeStr === ':int' || typeStr === ':int32' ? typeStr : ''
    return `${prefix}${optional}${name}${base}:${vals}`
  }

  const defaultVal = schema.default !== undefined ? `=${schema.default}` : ''

  let constraintStr = ''
  if (typeStr === ':int' || typeStr === ':int32' || typeStr === ':int64' || typeStr === ':float' || typeStr === ':double') {
    const parts: string[] = []
    if (schema.minimum !== undefined && schema.maximum !== undefined) {
      parts.push(`${schema.minimum}..${schema.maximum}`)
    } else {
      if (schema.minimum !== undefined) parts.push(`>=${schema.minimum}`)
      if (schema.maximum !== undefined) parts.push(`<=${schema.maximum}`)
    }
    if (schema.multipleOf !== undefined) parts.push(`*${schema.multipleOf}`)
    if (parts.length) constraintStr = `(${parts.join(',')})`
  } else if (!typeStr) {
    const min = schema.minLength, max = schema.maxLength
    if (min !== undefined && max !== undefined) constraintStr = `(${min}..${max})`
    else if (min !== undefined) constraintStr = `(min:${min})`
    else if (max !== undefined) constraintStr = `(max:${max})`
  }

  return `${prefix}${optional}${name}${typeStr}${defaultVal}${constraintStr}`
}

// ── Request body ──────────────────────────────────────────────────────────────

function renderBody(
  operation: OperationObject,
  refCounts: RefCounts,
  schemas: Record<string, SchemaObject>
): string {
  const reqBody = operation.requestBody as any
  if (!reqBody) return ''

  const content = reqBody.content || {}
  const jsonContent = content['application/json'] || content['multipart/form-data'] ||
    content['application/x-www-form-urlencoded'] || content['application/octet-stream'] ||
    content['text/plain'] || Object.values(content)[0]

  if (!jsonContent) return ''

  const schema = (jsonContent as any).schema
  if (!schema) return ''

  if ('$ref' in schema) {
    return refName(schema.$ref)
  }

  const s = schema as SchemaObject
  const props = s.properties || {}
  const required = new Set<string>(s.required || [])
  const fields = Object.entries(props).map(([n, p]) =>
    renderField(n, p as SchemaObject | ReferenceObject, required, refCounts, schemas)
  )
  return `{${fields.join(', ')}}`
}

// ── Responses ─────────────────────────────────────────────────────────────────

interface ResponseGroup {
  codes: string[]
  body: string
  headers: string
}

function groupResponseCodes(
  sortedCodes: string[],
  responses: Record<string, ResponseObject | ReferenceObject>,
  refCounts: RefCounts,
  schemas: Record<string, SchemaObject>
): ResponseGroup[] {
  const rendered = sortedCodes.map(code => {
    const resp = responses[code] as ResponseObject
    if (!resp) return { code, body: '', headers: '' }
    return {
      code,
      body: renderResponseBody(resp, refCounts, schemas),
      headers: renderResponseHeaders(resp)
    }
  })

  // group consecutive codes with identical body and no headers
  const groups: ResponseGroup[] = []
  let i = 0
  while (i < rendered.length) {
    const cur = rendered[i]
    // only group if no headers
    if (!cur.headers) {
      const sameBody = [cur]
      let j = i + 1
      while (j < rendered.length && rendered[j].body === cur.body && !rendered[j].headers) {
        sameBody.push(rendered[j])
        j++
      }
      if (sameBody.length > 1) {
        groups.push({ codes: sameBody.map(r => r.code), body: cur.body, headers: '' })
        i = j
        continue
      }
    }
    groups.push({ codes: [cur.code], body: cur.body, headers: cur.headers })
    i++
  }

  return groups
}

function renderResponseBody(
  resp: ResponseObject,
  refCounts: RefCounts,
  schemas: Record<string, SchemaObject>
): string {
  const content = (resp as any).content
  if (!content) return ''

  const mediaTypes = Object.keys(content)
  if (mediaTypes.length === 0) return ''

  // prefer JSON
  const jsonKey = mediaTypes.find(m => m === 'application/json' || m.endsWith('+json'))
  const chosenKey = jsonKey || mediaTypes[0]
  const chosenContent = content[chosenKey]

  // non-JSON responses
  if (!jsonKey) {
    return renderNonJsonResponse(chosenKey)
  }

  const schema = chosenContent?.schema
  if (!schema) return ''

  if ('$ref' in schema) return refName(schema.$ref)

  const s = schema as SchemaObject

  // array of named ref
  if (s.type === 'array' && s.items && '$ref' in s.items) {
    return `${refName((s.items as ReferenceObject).$ref)}[]`
  }

  // inline object
  if (s.type === 'object' || s.properties) {
    const props = s.properties || {}
    const required = new Set<string>(s.required || [])
    const fields = Object.entries(props).map(([n, p]) =>
      renderField(n, p as SchemaObject | ReferenceObject, required, refCounts, schemas)
    )
    return `{${fields.join(', ')}}`
  }

  // oneOf/anyOf
  if (s.oneOf || s.anyOf) {
    return renderSchemaType(s, refCounts, schemas, true)
  }

  const typeStr = compactType(s as any)
  return typeStr ? typeStr.slice(1) : ''
}

function renderNonJsonResponse(mediaType: string): string {
  const map: Record<string, { type: string; note?: string }> = {
    'application/octet-stream': { type: 'binary' },
    'application/pdf': { type: 'binary', note: 'application/pdf' },
    'text/plain': { type: 'string', note: 'text/plain' },
    'text/csv': { type: 'string', note: 'text/csv' },
    'text/html': { type: 'string', note: 'text/html' },
  }

  if (mediaType.startsWith('image/')) {
    return `binary  # ${mediaType}`
  }

  const entry = map[mediaType]
  if (entry) {
    return entry.note ? `${entry.type}  # ${entry.note}` : entry.type
  }

  return `binary  # ${mediaType}`
}

function renderResponseHeaders(resp: ResponseObject): string {
  const headers = (resp as any).headers as Record<string, HeaderObject> | undefined
  if (!headers) return ''

  const parts: string[] = []
  for (const [headerName, headerDef] of Object.entries(headers)) {
    const schema = (headerDef as any).schema as SchemaObject | undefined
    const typeStr = schema ? compactType(schema as any) : ''
    parts.push(`${headerName}${typeStr}[ro]`)
  }

  return parts.join(', ')
}
