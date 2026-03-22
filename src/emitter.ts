import type { OpenAPIV3 } from '@apidevtools/swagger-parser'
import { compactType, isEmptySchema } from './typeMap'
import type { RefCounts } from './types'

type SchemaObject = OpenAPIV3.SchemaObject
type ReferenceObject = OpenAPIV3.ReferenceObject

// ── Constraints ──────────────────────────────────────────────────────────────

function numericConstraints(schema: SchemaObject): string {
  const parts: string[] = []
  if (schema.minimum !== undefined && schema.maximum !== undefined) {
    parts.push(`${schema.minimum}..${schema.maximum}`)
  } else {
    if (schema.minimum !== undefined) parts.push(`>=${schema.minimum}`)
    else if (typeof (schema as any).exclusiveMinimum === 'number') parts.push(`>${(schema as any).exclusiveMinimum}`)
    if (schema.maximum !== undefined) parts.push(`<=${schema.maximum}`)
    else if (typeof (schema as any).exclusiveMaximum === 'number') parts.push(`<${(schema as any).exclusiveMaximum}`)
  }
  if (schema.multipleOf !== undefined) parts.push(`*${schema.multipleOf}`)
  return parts.join(',')
}

function stringConstraints(schema: SchemaObject): string {
  const min = schema.minLength
  const max = schema.maxLength
  const pattern = schema.pattern
  const parts: string[] = []

  if (min !== undefined && max !== undefined) {
    parts.push(`${min}..${max}`)
  } else {
    if (min !== undefined) parts.push(`min:${min}`)
    if (max !== undefined) parts.push(`max:${max}`)
  }

  if (pattern) {
    const p = pattern.length > 60
      ? `pattern:${pattern.slice(0, 57)}...[see source]`
      : `pattern:${pattern}`
    parts.push(p)
  }

  return parts.join(',')
}

function arrayConstraints(schema: SchemaObject): string {
  const min = schema.minItems
  const max = schema.maxItems
  const unique = schema.uniqueItems
  const parts: string[] = []

  if (min !== undefined && max !== undefined) {
    parts.push(`${min}..${max}`)
  } else {
    if (min !== undefined) parts.push(`min:${min}`)
    if (max !== undefined) parts.push(`max:${max}`)
  }

  if (unique) parts.push('unique')
  return parts.join(',')
}

function mapConstraints(schema: SchemaObject): string {
  const parts: string[] = []
  if (schema.minProperties !== undefined && schema.minProperties > 0) parts.push(`min:${schema.minProperties}`)
  if (schema.maxProperties !== undefined) parts.push(`max:${schema.maxProperties}`)
  return parts.join(',')
}

// ── Type rendering (used in non-field contexts: array items, map values) ─────

function explicitTypeName(
  schema: SchemaObject | ReferenceObject,
  refCounts: RefCounts,
  schemas: Record<string, SchemaObject>
): string {
  if ('$ref' in schema) return refName(schema.$ref)
  const s = schema as SchemaObject
  if (s.type === 'array' || (s as any).items) {
    const items = s.items
    if (!items) return 'any[]'
    const inner = explicitTypeName(items as SchemaObject | ReferenceObject, refCounts, schemas)
    const arrC = arrayConstraints(s)
    return `${inner}[]${arrC ? `(${arrC})` : ''}`
  }
  const t = compactType(s as any)
  if (t !== '') return t.replace(/^:/, '')
  if (s.type === 'object' || s.properties || s.additionalProperties !== undefined) {
    return renderObjectType(s, refCounts, schemas)
  }
  return 'string'
}

// ── Schema type rendering ─────────────────────────────────────────────────────

export function renderSchemaType(
  schema: SchemaObject | ReferenceObject,
  refCounts: RefCounts,
  schemas: Record<string, SchemaObject>,
  forceInline = false
): string {
  if ('$ref' in schema) return refName(schema.$ref)

  const s = schema as SchemaObject

  if (isEmptySchema(s as any)) return ':any'

  if (s.type === 'array') {
    const items = s.items
    if (!items) return 'any[]'
    const inner = explicitTypeName(items as SchemaObject | ReferenceObject, refCounts, schemas)
    const arrC = arrayConstraints(s)
    return `${inner}[]${arrC ? `(${arrC})` : ''}`
  }

  if (s.oneOf) {
    const disc = (s as any).discriminator?.propertyName
    const members = s.oneOf.map(m =>
      '$ref' in m ? refName((m as ReferenceObject).$ref) : renderSchemaType(m as SchemaObject, refCounts, schemas, true)
    )
    if (disc) return `OneOf<${members.join(', ')}> on ${disc}`
    return members.join(' | ')
  }

  if (s.anyOf) {
    const members = s.anyOf.map(m =>
      '$ref' in m ? refName((m as ReferenceObject).$ref) : renderSchemaType(m as SchemaObject, refCounts, schemas, true)
    )
    return `AnyOf<${members.join(', ')}>`
  }

  if (s.allOf) return renderAllOf(s, refCounts, schemas)

  if (s.type === 'object' || s.properties || s.additionalProperties !== undefined) {
    return renderObjectType(s, refCounts, schemas)
  }

  const typeStr = compactType(s as any)
  if (s.enum) {
    if (s.enum.length === 1) return `"${s.enum[0]}"`
    const base = typeStr === ':int' || typeStr === ':int32' || typeStr === ':int64' ? typeStr : ''
    return `${base}${s.enum.join('|')}`
  }

  return typeStr || ''
}

function renderObjectType(
  s: SchemaObject,
  refCounts: RefCounts,
  schemas: Record<string, SchemaObject>
): string {
  const addlProps = (s as any).additionalProperties

  // pure map
  if (!s.properties && addlProps && typeof addlProps === 'object') {
    const valType = isEmptySchema(addlProps) ? '' : explicitTypeName(addlProps as SchemaObject, refCounts, schemas)
    const c = mapConstraints(s)
    if (!valType) return `{*}${c ? `(${c})` : ''}`
    return `{*:${valType}}${c ? `(${c})` : ''}`
  }

  if (!s.properties && (addlProps === true || addlProps === undefined)) return '{...}'

  const props = s.properties || {}
  const required = new Set<string>(s.required || [])
  const isOpen = addlProps === true

  const fieldStrs = Object.entries(props).map(([name, p]) =>
    renderField(name, p as SchemaObject | ReferenceObject, required, refCounts, schemas)
  )
  if (isOpen) fieldStrs.push('...')

  return `{${fieldStrs.join(', ')}}`
}

function renderAllOf(
  s: SchemaObject,
  refCounts: RefCounts,
  schemas: Record<string, SchemaObject>
): string {
  const allOf = s.allOf!
  const bases = allOf.filter(m => '$ref' in m) as ReferenceObject[]
  const extensions = allOf.filter(m => !('$ref' in m)) as SchemaObject[]

  const baseParts = bases.map(b => refName(b.$ref))
  const extParts = extensions
    .filter(ext => ext.properties && Object.keys(ext.properties).length > 0)
    .map(ext => renderObjectType(ext, refCounts, schemas))

  return [...baseParts, ...extParts].join(' & ')
}

// ── Field rendering ───────────────────────────────────────────────────────────

export function renderField(
  name: string,
  schema: SchemaObject | ReferenceObject,
  requiredSet: Set<string>,
  refCounts: RefCounts,
  schemas: Record<string, SchemaObject>
): string {
  if ('$ref' in schema) {
    const rn = refName(schema.$ref)
    const optional = !requiredSet.has(name) ? '?' : ''
    return `${name}${optional}:${rn}`
  }

  const s = schema as SchemaObject
  const deprecated = s.deprecated ? `~~${name}~~` : name
  const optional = !requiredSet.has(name) ? '?' : ''
  const nullable = (s as any).nullable === true
  const readOnly = s.readOnly ? '[ro]' : ''
  const writeOnly = s.writeOnly ? '[w]' : ''
  const defaultVal = s.default !== undefined ? `=${formatDefault(s.default)}` : ''

  // enum field
  if (s.enum) {
    const vals = nullable ? [...s.enum.filter((v: any) => v !== null), 'null'] : [...s.enum]
    if (vals.length === 1 && vals[0] !== 'null') {
      return `${deprecated}${optional}:"${vals[0]}"${readOnly}${writeOnly}${defaultVal}`
    }
    const typePrefix = s.type === 'integer' ? ':int:' : ':'
    return `${deprecated}${optional}${typePrefix}${vals.join('|')}${readOnly}${writeOnly}${defaultVal}`
  }

  // array field
  if (s.type === 'array') {
    const items = s.items
    const inner = items ? explicitTypeName(items as SchemaObject | ReferenceObject, refCounts, schemas) : 'any'
    const arrC = arrayConstraints(s)
    const typeStr = `${inner}[]${arrC ? `(${arrC})` : ''}`
    const nullSuffix = nullable ? '|null' : ''
    return `${deprecated}${optional}:${typeStr}${nullSuffix}${readOnly}${writeOnly}${defaultVal}`
  }

  // composed types
  if (s.oneOf || s.anyOf || s.allOf) {
    const composed = renderSchemaType(s, refCounts, schemas, true)
    const nullSuffix = nullable ? '|null' : ''
    return `${deprecated}${optional}:${composed.replace(/^:/, '')}${nullSuffix}${readOnly}${writeOnly}${defaultVal}`
  }

  // object field
  if (s.type === 'object' || s.properties || s.additionalProperties !== undefined) {
    const objType = renderObjectType(s, refCounts, schemas)
    const nullSuffix = nullable ? '|null' : ''
    return `${deprecated}${optional}:${objType}${nullSuffix}${readOnly}${writeOnly}${defaultVal}`
  }

  // primitive
  const typeStr = compactType(s as any)
  const nullSuffix = nullable ? '|null' : ''

  // when nullable and plain string, emit :string explicitly
  const effectiveTypeStr = nullable && !typeStr ? ':string' : typeStr

  if (!effectiveTypeStr) {
    // plain string: modifiers before constraints per Section 7
    const sc = stringConstraints(s)
    const constraintStr = sc ? `(${sc})` : ''
    return `${deprecated}${optional}${nullSuffix}${readOnly}${writeOnly}${defaultVal}${constraintStr}`
  }

  let constraintStr = ''
  if (effectiveTypeStr === ':int' || effectiveTypeStr === ':int32' || effectiveTypeStr === ':int64' ||
      effectiveTypeStr === ':float' || effectiveTypeStr === ':double') {
    const nc = numericConstraints(s)
    if (nc) constraintStr = `(${nc})`
  } else if (effectiveTypeStr === ':string' || effectiveTypeStr === '') {
    const sc = stringConstraints(s)
    if (sc) constraintStr = `(${sc})`
  }

  // modifier order: name ? :type |null [ro]|[w] =default (constraints)
  return `${deprecated}${optional}${effectiveTypeStr}${nullSuffix}${readOnly}${writeOnly}${defaultVal}${constraintStr}`
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function refName(ref: string): string {
  return ref.split('/').pop()!
}

function formatDefault(val: unknown): string {
  if (typeof val === 'string') return `"${val}"`
  return String(val)
}

// ── Named schema rendering ────────────────────────────────────────────────────

export function renderNamedSchema(
  name: string,
  schema: SchemaObject,
  refCounts: RefCounts,
  schemas: Record<string, SchemaObject>
): string {
  const schemaName = schema.deprecated ? `~~${name}~~` : name

  if (schema.oneOf) {
    const disc = (schema as any).discriminator?.propertyName
    const members = schema.oneOf.map(m =>
      '$ref' in m ? refName((m as ReferenceObject).$ref) : renderSchemaType(m as SchemaObject, refCounts, schemas, true)
    )
    if (disc) return `${schemaName}: OneOf<${members.join(', ')}> on ${disc}`
    return `${schemaName}: ${members.join(' | ')}`
  }

  if (schema.anyOf) {
    const members = schema.anyOf.map(m =>
      '$ref' in m ? refName((m as ReferenceObject).$ref) : renderSchemaType(m as SchemaObject, refCounts, schemas, true)
    )
    return `${schemaName}: AnyOf<${members.join(', ')}>`
  }

  if (schema.allOf) {
    const allOf = schema.allOf
    const bases = allOf.filter(m => '$ref' in m) as ReferenceObject[]
    const extensions = allOf.filter(m => !('$ref' in m)) as SchemaObject[]

    const baseParts = bases.map(b => refName(b.$ref))
    const extParts = extensions
      .filter(ext => ext.properties && Object.keys(ext.properties).length > 0)
      .map(ext => {
        const req = new Set<string>(ext.required || [])
        const fields = Object.entries(ext.properties || {}).map(([n, p]) =>
          renderField(n, p as SchemaObject | ReferenceObject, req, refCounts, schemas)
        )
        return `{${fields.join(', ')}}`
      })

    const allParts = [...baseParts, ...extParts]
    const rhs = allParts.join(' & ')
    return `${schemaName}: extends ${rhs}`
  }

  // open / map
  const addlProps = (schema as any).additionalProperties
  if (!schema.properties) {
    if (addlProps && typeof addlProps === 'object') {
      if (isEmptySchema(addlProps)) return `${schemaName}: {*}`
      const valType = explicitTypeName(addlProps as SchemaObject, refCounts, schemas)
      return `${schemaName}: {*:${valType}}`
    }
    if (addlProps === true || schema.type === 'object') return `${schemaName}: {...}`
  }

  const props = schema.properties || {}
  const required = new Set<string>(schema.required || [])
  const fields = Object.entries(props).map(([n, p]) =>
    renderField(n, p as SchemaObject | ReferenceObject, required, refCounts, schemas)
  )

  if (addlProps === true) fields.push('...')

  return `${schemaName}: {${fields.join(', ')}}`
}
