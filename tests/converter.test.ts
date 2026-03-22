import { describe, test, expect } from 'bun:test'
import SwaggerParser from '@apidevtools/swagger-parser'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { convert } from '../src/converter'
import type { OpenAPIV3 } from 'openapi-types'

const EXAMPLES_DIR = join(import.meta.dir, '../examples')

const examples = readdirSync(EXAMPLES_DIR).filter(d => {
  try {
    readdirSync(join(EXAMPLES_DIR, d))
    return true
  } catch { return false }
})

describe('converter golden-file tests', () => {
  for (const example of examples) {
    const dir = join(EXAMPLES_DIR, example)
    const inputPath = join(dir, 'input.openapi.yaml')
    const expectedPath = join(dir, 'output.mind.yaml')

    test(example, async () => {
      const doc = await SwaggerParser.bundle(inputPath) as OpenAPIV3.Document
      const expected = readFileSync(expectedPath, 'utf-8')

      const result = convert(doc, {
        sourcePath: `examples/${example}/input.openapi.yaml`,
        generatedAt: '2026-03-22T00:00:00Z',
      })

      expect(result).toBe(expected)
    })
  }
})
