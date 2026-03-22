export function compactType(schema: Record<string, unknown>): string {
  const type = schema.type as string | undefined
  const format = schema.format as string | undefined

  if (!type || (type === 'string' && !format)) return ''

  if (type === 'string') {
    switch (format) {
      case 'date': return ':date'
      case 'date-time': return ':datetime'
      case 'password': return ':password'
      case 'byte': return ':base64'
      case 'binary': return ':binary'
      case 'email': return ':email'
      case 'uuid': return ':uuid'
      case 'uri': return ':uri'
      case 'hostname': return ':hostname'
      case 'ipv4': return ':ipv4'
      case 'ipv6': return ':ipv6'
      default: return ''
    }
  }

  if (type === 'integer') {
    if (format === 'int32') return ':int32'
    if (format === 'int64') return ':int64'
    return ':int'
  }

  if (type === 'number') {
    if (format === 'double') return ':double'
    return ':float'
  }

  if (type === 'boolean') return ':bool'

  return ''
}

export function isEmptySchema(schema: Record<string, unknown>): boolean {
  const keys = Object.keys(schema).filter(
    k => !['description', 'title', 'example', 'examples', 'deprecated'].includes(k)
  )
  return keys.length === 0
}
