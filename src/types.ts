export interface ConvertOptions {
  sourcePath: string
  generatedAt: string
  noNotation?: boolean
}

export interface RefCounts {
  [schemaName: string]: number
}
