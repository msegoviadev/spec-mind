#!/usr/bin/env node
import { program } from 'commander'
import SwaggerParser from '@apidevtools/swagger-parser'
import { convert } from './converter'
import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync, statSync } from 'node:fs'
import { join, dirname, basename, extname, resolve } from 'node:path'

const VERSION = '0.1.0'

function findSpecs(dir: string): string[] {
  const specs: string[] = []
  const entries = readdirSync(dir)
  
  for (const entry of entries) {
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)
    
    if (stat.isDirectory()) {
      specs.push(...findSpecs(fullPath))
    } else if (stat.isFile()) {
      const ext = extname(entry).toLowerCase()
      if (['.yaml', '.yml', '.json'].includes(ext)) {
        if (!entry.endsWith('.mind')) {
          specs.push(fullPath)
        }
      }
    }
  }
  
  return specs.sort()
}

function getOutputPath(inputPath: string): string {
  const ext = extname(inputPath)
  return inputPath.replace(new RegExp(`${ext}$`), '.mind')
}

async function processFile(
  input: string,
  outputPath: string | null,
  noNotation: boolean
): Promise<string> {
  const doc = await SwaggerParser.bundle(input) as any
  
  const result = convert(doc, {
    sourcePath: input,
    generatedAt: new Date().toISOString(),
    noNotation
  })
  
  if (outputPath) {
    writeFileSync(outputPath, result)
  }
  
  return result
}

async function validateFile(input: string, noNotation: boolean): Promise<boolean> {
  const outputPath = getOutputPath(input)
  
  if (!existsSync(outputPath)) {
    return false
  }
  
  const existing = readFileSync(outputPath, 'utf-8')
  const fresh = await processFile(input, null, noNotation)
  
  return existing === fresh
}

program
  .name('spec-mind')
  .version(VERSION)
  .description('Convert OpenAPI and AsyncAPI specs to compact .mind format')

program
  .command('convert <input>')
  .description('Convert a single OpenAPI spec to .mind')
  .option('-o, --output <file>', 'Output file path')
  .option('--no-notation', 'Omit NOTATION legend from output')
  .action(async (input, options) => {
    const resolvedInput = resolve(input)
    const outputPath = options.output || getOutputPath(resolvedInput)
    
    try {
      await processFile(resolvedInput, outputPath, !options.notation)
      console.log(`✓ Written to ${outputPath}`)
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`)
      process.exit(1)
    }
  })

program
  .command('sync <dir>')
  .description('Sync directory: process all specs, remove orphans')
  .option('--no-notation', 'Omit NOTATION legend from output')
  .action(async (dir, options) => {
    const resolvedDir = resolve(dir)
    const specs = findSpecs(resolvedDir)
    
    const generated = new Set<string>()
    
    for (const spec of specs) {
      const outputPath = getOutputPath(spec)
      generated.add(outputPath)
      
      try {
        await processFile(spec, outputPath, !options.notation)
        console.log(`✓ ${spec} → ${outputPath}`)
      } catch (err) {
        console.error(`✗ ${spec}: ${(err as Error).message}`)
      }
    }
    
    // Remove orphaned .mind files
    const allMindFiles = findMindFiles(resolvedDir)
    for (const mindFile of allMindFiles) {
      if (!generated.has(mindFile)) {
        unlinkSync(mindFile)
        console.log(`✗ Removed orphan: ${mindFile}`)
      }
    }
  })

program
  .command('validate <input>')
  .description('Validate .mind is in sync with source')
  .option('--no-notation', 'Omit NOTATION legend from output')
  .action(async (input, options) => {
    const resolvedInput = resolve(input)
    
    try {
      const valid = await validateFile(resolvedInput, !options.notation)
      if (valid) {
        console.log('✓ In sync')
        process.exit(0)
      } else {
        console.error('✗ Out of sync')
        process.exit(1)
      }
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`)
      process.exit(1)
    }
  })

function findMindFiles(dir: string): string[] {
  const files: string[] = []
  const entries = readdirSync(dir)
  
  for (const entry of entries) {
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)
    
    if (stat.isDirectory()) {
      files.push(...findMindFiles(fullPath))
    } else if (stat.isFile() && entry.endsWith('.mind')) {
      files.push(fullPath)
    }
  }
  
  return files.sort()
}

program.parse()