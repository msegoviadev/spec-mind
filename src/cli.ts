#!/usr/bin/env node
import { program } from 'commander'
import SwaggerParser from '@apidevtools/swagger-parser'
import { convert } from './converter'
import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync, statSync } from 'node:fs'
import { join, extname, resolve, relative, basename } from 'node:path'
import pkg from '../package.json' with { type: 'json' }

const VERSION = pkg.version

// ---------------------------------------------------------------------------
// Color helpers — respects NO_COLOR env var and non-TTY pipes
// ---------------------------------------------------------------------------

const noColor = !process.stdout.isTTY || !!process.env.NO_COLOR
const trueColor = !noColor && ['truecolor', '24bit'].includes(process.env.COLORTERM ?? '')

// Wrap with a basic ANSI code (bold, dim, etc.)
function ansi(code: string): (s: string) => string {
  return (s: string) => noColor ? s : `\x1b[${code}m${s}\x1b[0m`
}

// Grapity exact palette — true-color ANSI with basic-color fallback.
// Structure:  indigo (#6366f1) frames and anchors
// Metrics:    cyan (#06b6d4) counts, emerald (#34d399) results, purple (#a855f7) headline
// Prose:      slate (#94a3b8) readable chrome
// Accent:     amber (#fbbf24) warm spark
function tc(r: number, g: number, b: number, fallback: string): (s: string) => string {
  if (noColor) return (s: string) => s
  if (trueColor) return (s: string) => `\x1b[38;2;${r};${g};${b}m${s}\x1b[0m`
  return (s: string) => `\x1b[${fallback}m${s}\x1b[0m`
}

const _bold = ansi('1')
const _dim  = ansi('2')

const clr = {
  bold:         _bold,
  dim:          _dim,
  // Slate #94a3b8 — headers, input sizes, prose
  slate:        tc(148, 163, 184, '37'),
  boldSlate:    (s: string) => _bold(tc(148, 163, 184, '37')(s)),
  // Indigo #6366f1 — entity names, structural identity
  indigo:       tc(99, 102, 241, '34'),
  boldIndigo:   (s: string) => _bold(tc(99, 102, 241, '34')(s)),
  // Neon cyan #06b6d4 — counts, metrics
  cyan:         tc(6, 182, 212, '96'),
  boldCyan:     (s: string) => _bold(tc(6, 182, 212, '96')(s)),
  // Emerald #34d399 — output sizes, results
  emerald:      tc(52, 211, 153, '92'),
  boldEmerald:  (s: string) => _bold(tc(52, 211, 153, '92')(s)),
  // Electric purple #a855f7 — headline metric (reduction %), summary callout
  purple:       tc(168, 85, 247, '95'),
  boldPurple:   (s: string) => _bold(tc(168, 85, 247, '95')(s)),
  // Amber #fbbf24 — ⚡ warm spark
  amber:        tc(251, 191, 36, '33'),
}

// ---------------------------------------------------------------------------
// Stats types and helpers
// ---------------------------------------------------------------------------

interface FileStats {
  inputPath: string
  outputPath: string
  inputBytes: number
  outputBytes: number
  endpointCount: number
}

function roundTokens(n: number): number {
  if (n >= 1000) return Math.round(n / 100) * 100
  return Math.round(n / 10) * 10
}

// Normalize all values in a column to the same unit so rows don't mix B and KB
function columnFormatter(values: number[]): (v: number) => string {
  const max = Math.max(...values)
  if (max >= 1024 * 1024) return v => `${(v / 1024 / 1024).toFixed(1)} MB`
  if (max >= 1024)        return v => `${(v / 1024).toFixed(1)} KB`
  return                         v => `${v} B`
}

const PCT_WIDTH = 4   // visual width of the % label: " 82%"

function colorPct(pct: number, colW = PCT_WIDTH, bold = false): string {
  const s = `${pct}%`.padStart(colW)
  if (pct >= 70) return bold ? clr.boldPurple(s) : clr.purple(s)
  if (pct >= 40) return bold ? clr.bold(clr.amber(s)) : clr.amber(s)
  return                bold ? clr.bold(s)        : s
}

// ---------------------------------------------------------------------------
// Stats display: single file
// ---------------------------------------------------------------------------

function printConvertStats(stats: FileStats): void {
  const pct       = Math.round((1 - stats.outputBytes / stats.inputBytes) * 100)
  const inputTok  = roundTokens(stats.inputBytes / 4)
  const outputTok = roundTokens(stats.outputBytes / 4)
  const savedTok  = roundTokens((stats.inputBytes - stats.outputBytes) / 4)
  const avgTok    = roundTokens(stats.outputBytes / 4 / Math.max(stats.endpointCount, 1))
  const rawAvgTok = roundTokens(stats.inputBytes / 4 / Math.max(stats.endpointCount, 1))
  const ratio     = Math.round(stats.inputBytes / stats.outputBytes)

  const fmtBytes = columnFormatter([stats.inputBytes, stats.outputBytes])

  const LABEL = 16
  const label = (s: string) => s.padEnd(LABEL)

  console.log([
    '',
    `  ${clr.boldIndigo('spec-mind')}`,
    '',
    `  ${clr.boldSlate(label('Input  (YAML)'))}${clr.slate(fmtBytes(stats.inputBytes))}  ${clr.slate(`(~${inputTok.toLocaleString()} tokens)`)}`,
    `  ${clr.boldSlate(label('Output (.mind)'))}${clr.emerald(fmtBytes(stats.outputBytes))}  ${clr.slate(`(~${outputTok.toLocaleString()} tokens)`)}`,
    `  ${clr.boldSlate(label('Reduction'))}${colorPct(pct)}`,
    `  ${clr.boldSlate(label('Endpoints'))}${clr.cyan(String(stats.endpointCount))}`,
    '',
    `  ${clr.amber('⚡')} ${clr.boldPurple(`~${savedTok.toLocaleString()} tokens saved`)}  ${clr.slate(`·  ${pct}%  ·  ~${ratio}x`)}`,
    `     ${clr.slate(`~${avgTok.toLocaleString()} per call`)}  ${clr.dim(clr.slate(`(~${outputTok.toLocaleString()} total  vs  ~${inputTok.toLocaleString()} raw)`))}`,
    '',
  ].join('\n'))
}

// ---------------------------------------------------------------------------
// Stats display: multi-file table
// ---------------------------------------------------------------------------

function printSyncStats(allStats: FileStats[], resolvedDir: string): void {
  if (allStats.length === 0) return

  const rows = allStats.map(s => ({
    name:          s.inputPath.replace(resolvedDir + '/', '').replace(/\.(yaml|yml|json)$/, ''),
    pct:           Math.round((1 - s.outputBytes / s.inputBytes) * 100),
    inputBytes:    s.inputBytes,
    outputBytes:   s.outputBytes,
    endpointCount: s.endpointCount,
  }))

  const fmtInput  = columnFormatter(rows.map(r => r.inputBytes))
  const fmtOutput = columnFormatter(rows.map(r => r.outputBytes))

  // PFXW = visual width of the '❯ ' prefix on data rows
  const PFXW = 2

  // Column widths (all in visual/display characters, excluding PFXW)
  const specW  = Math.min(Math.max(...rows.map(r => r.name.length), 'Spec'.length, 'Total'.length), 50)
  const endpW  = Math.max(...rows.map(r => String(r.endpointCount).length), 'Endpoints'.length)
  const redW   = Math.max(PCT_WIDTH, 'Reduction'.length)
  const inputW = Math.max(...rows.map(r => fmtInput(r.inputBytes).length), 'Input'.length)
  const outW   = Math.max(...rows.map(r => fmtOutput(r.outputBytes).length), 'Output'.length)

  const GAP = '  '
  const totalVisualW = (specW + PFXW) + endpW + redW + inputW + outW + GAP.length * 4

  // Cyan separator (neon structural frame)
  const separator = clr.cyan('─'.repeat(totalVisualW))

  // Header: first cell is PFXW wider to align with prefixed data rows
  const header = [
    clr.boldSlate('Spec'.padEnd(specW + PFXW)),
    clr.boldSlate('Endpoints'.padStart(endpW)),
    clr.boldSlate('Reduction'.padStart(redW)),
    clr.boldSlate('Input'.padStart(inputW)),
    clr.boldSlate('Output'.padStart(outW)),
  ].join(GAP)

  console.log(`\n  ${clr.boldIndigo('spec-mind')}`)
  console.log(`\n  ${header}`)
  console.log(`  ${separator}`)

  for (const row of rows) {
    const name = row.name.length > specW
      ? '…' + row.name.slice(-(specW - 1))
      : row.name.padEnd(specW)

    const line = [
      clr.dim(clr.cyan('❯')) + ' ' + clr.indigo(name),
      clr.cyan(String(row.endpointCount).padStart(endpW)),
      colorPct(row.pct, redW),
      clr.slate(fmtInput(row.inputBytes).padStart(inputW)),
      clr.emerald(fmtOutput(row.outputBytes).padStart(outW)),
    ].join(GAP)

    console.log(`  ${line}`)
  }

  console.log(`  ${separator}`)

  const totalInput     = allStats.reduce((s, f) => s + f.inputBytes, 0)
  const totalOutput    = allStats.reduce((s, f) => s + f.outputBytes, 0)
  const totalEndpoints = allStats.reduce((s, f) => s + f.endpointCount, 0)
  const totalPct       = Math.round((1 - totalOutput / totalInput) * 100)

  // Total row: 2 plain spaces instead of '❯ ' prefix to keep alignment
  const totalLine = [
    '  ' + clr.boldIndigo('Total'.padEnd(specW)),
    clr.boldCyan(String(totalEndpoints).padStart(endpW)),
    colorPct(totalPct, redW, true),
    clr.boldSlate(fmtInput(totalInput).padStart(inputW)),
    clr.boldEmerald(fmtOutput(totalOutput).padStart(outW)),
  ].join(GAP)

  console.log(`  ${totalLine}`)

  const totalInputTok  = roundTokens(totalInput / 4)
  const totalOutputTok = roundTokens(totalOutput / 4)
  const savedTok       = roundTokens((totalInput - totalOutput) / 4)
  const avgTok         = roundTokens(totalOutput / 4 / Math.max(totalEndpoints, 1))
  const ratio          = Math.round(totalInput / totalOutput)

  console.log(`\n  ${clr.amber('⚡')} ${clr.boldPurple(`~${savedTok.toLocaleString()} tokens saved`)}  ${clr.slate(`·  ${totalPct}%  ·  ~${ratio}x`)}`)
  console.log(`     ${clr.slate(`~${avgTok.toLocaleString()} per call`)}  ${clr.dim(clr.slate(`(~${totalOutputTok.toLocaleString()} total  vs  ~${totalInputTok.toLocaleString()} raw)`))}\n`)
}

// ---------------------------------------------------------------------------
// Core file processing
// ---------------------------------------------------------------------------

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
      if (['.yaml', '.yml', '.json'].includes(ext) && !entry.endsWith('.mind')) {
        specs.push(fullPath)
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
): Promise<{ result: string; stats: FileStats }> {
  const inputBytes = statSync(input).size
  const doc = await SwaggerParser.bundle(input) as any

  const result = convert(doc, {
    sourcePath: input,
    generatedAt: new Date().toISOString(),
    noNotation,
  })

  if (outputPath) {
    writeFileSync(outputPath, result)
  }

  const outputBytes    = Buffer.byteLength(result, 'utf-8')
  const endpointCount  = (result.match(/^(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) /gm) ?? []).length

  return {
    result,
    stats: { inputPath: input, outputPath: outputPath ?? '', inputBytes, outputBytes, endpointCount },
  }
}

async function validateFile(input: string, noNotation: boolean): Promise<boolean> {
  const outputPath = getOutputPath(input)
  if (!existsSync(outputPath)) return false
  const existing = readFileSync(outputPath, 'utf-8')
  const { result: fresh } = await processFile(input, null, noNotation)
  return existing === fresh
}

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

// ---------------------------------------------------------------------------
// CLI commands
// ---------------------------------------------------------------------------

program
  .name('spec-mind')
  .version(VERSION)
  .description('Convert OpenAPI and AsyncAPI specs to compact .mind format')

program
  .command('convert <input>')
  .description('Convert a single OpenAPI spec to .mind')
  .option('-o, --output <file>', 'Output file path')
  .option('--no-notation', 'Omit NOTATION legend from output')
  .option('--stats', 'Print size and token comparison after conversion')
  .action(async (input, options) => {
    const resolvedInput = resolve(input)
    const outputPath = options.output || getOutputPath(resolvedInput)

    try {
      const { stats } = await processFile(resolvedInput, outputPath, !options.notation)
      const relIn  = relative(process.cwd(), resolvedInput) || basename(resolvedInput)
      const relOut = relative(process.cwd(), outputPath)    || basename(outputPath)
      console.log(`${clr.emerald('✓')} ${clr.slate(relIn)} ${clr.dim(clr.cyan('→'))} ${clr.indigo(relOut)}`)
      if (options.stats) printConvertStats(stats)
    } catch (err) {
      console.error(`${clr.amber('✗')} ${clr.slate((err as Error).message)}`)
      process.exit(1)
    }
  })

program
  .command('sync <dir>')
  .description('Sync directory: process all specs, remove orphans')
  .option('--no-notation', 'Omit NOTATION legend from output')
  .option('--stats', 'Print size and token comparison summary after sync')
  .action(async (dir, options) => {
    const resolvedDir = resolve(dir)
    const specs = findSpecs(resolvedDir)
    const generated = new Set<string>()
    const allStats: FileStats[] = []

    for (const spec of specs) {
      const outputPath = getOutputPath(spec)
      generated.add(outputPath)

      try {
        const { stats } = await processFile(spec, outputPath, !options.notation)
        const relSpec   = relative(resolvedDir, spec)
        const relOutput = relative(resolvedDir, outputPath)
        console.log(`${clr.emerald('✓')} ${clr.slate(relSpec)} ${clr.dim(clr.cyan('→'))} ${clr.indigo(relOutput)}`)
        if (options.stats) allStats.push(stats)
      } catch (err) {
        const relSpec = relative(resolvedDir, spec)
        console.error(`${clr.amber('✗')} ${clr.slate(relSpec)}${clr.dim(':')} ${clr.slate((err as Error).message)}`)
      }
    }

    const allMindFiles = findMindFiles(resolvedDir)
    for (const mindFile of allMindFiles) {
      if (!generated.has(mindFile)) {
        unlinkSync(mindFile)
        console.log(`${clr.amber('✗')} ${clr.slate('Removed orphan:')} ${clr.indigo(relative(resolvedDir, mindFile))}`)
      }
    }

    if (options.stats && allStats.length > 0) printSyncStats(allStats, resolvedDir)
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
        console.log(`${clr.emerald('✓')} ${clr.slate('In sync')}`)
        process.exit(0)
      } else {
        console.error(`${clr.amber('✗')} ${clr.slate('Out of sync')}`)
        process.exit(1)
      }
    } catch (err) {
      console.error(`${clr.amber('✗')} ${clr.slate((err as Error).message)}`)
      process.exit(1)
    }
  })

program.parse()
