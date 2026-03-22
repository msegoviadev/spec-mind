# spec-mind

Convert OpenAPI and AsyncAPI specifications into compact, token-efficient `.mind` format designed for LLM consumption. Achieves 60-80% token reduction while preserving essential API contract information.

## Installation

```bash
npm install -g spec-mind
# or
bun install -g spec-mind
```

## Usage

### Convert a single spec

```bash
spec-mind convert openapi.yaml
# Creates openapi.mind
```

### Convert with custom output

```bash
spec-mind convert openapi.yaml -o output.yaml
```

### Sync a directory

```bash
spec-mind sync ./api-specs/
# Processes all *.yaml/*.yml/*.json files
# Removes orphaned .mind files
```

### Validate (for CI)

```bash
spec-mind validate openapi.yaml
# Exits 0 if .mind is in sync with source
# Exits 1 if drift detected
```

### Options

```
--no-notation    Omit NOTATION legend from output
-o, --output     Custom output path (convert command only)
```

## Examples

```bash
# Convert a single OpenAPI spec
spec-mind convert ./api/openapi.yaml

# Sync entire directory
spec-mind sync ./specs/

# Validate in CI pipeline
spec-mind validate ./api/openapi.yaml || exit 1
```

## Supported Formats

| Format | Version | Status |
|--------|---------|--------|
| OpenAPI | 3.0, 3.1 | Supported (v1) |
| AsyncAPI | 2.x, 3.x | Planned (v2) |

## Format Specification

See [FORMAT_SPEC.md](./FORMAT_SPEC.md) for the complete `.mind` specification.

## How It Works

`spec-mind` parses your API specification and produces a compact representation that preserves:

- Endpoint identifiers, methods, and parameters with types and constraints
- Request/response body schemas with required/optional fields
- Auth/security schemes per operation
- Composition types: `oneOf`, `anyOf`, `allOf` (inheritance)
- Deprecation markers

Stripped from output:
- Prose descriptions and examples
- Cosmetic metadata and server boilerplate
- External docs and vendor extensions

## Output Format

```yaml
# COMPACT INDEX — navigational summary only. Do not derive contracts from this file.
# Source: openapi.yaml | Generated: 2026-03-22T00:00:00Z | Spec version: 1.0.0
# API: My API — https://api.example.com/v1
# NOTATION: ? optional  [ro] readOnly  [w] writeOnly  =val default

## Products
GET /products
  ?page:int=1, ?limit:int=20(<=100)
  -> 200: Product[]

POST /products
  body: CreateProductRequest
  -> 201: Product

## Schemas
Product:     {id:uuid[ro], name, price:float}
```

## License

MIT License - see [LICENSE](./LICENSE) for details.