# Product Brief: spec-mind

## Problem

API specifications are designed for human documentation and tooling validation. When injected into LLM context, 60-80% of tokens are consumed by descriptions, examples, and structural boilerplate that carry no actionable information for the model. As APIs grow and agentic workflows multiply, this creates real cost and context-window pressure. There is no standard, maintained tool for keeping a compact LLM-friendly version of a spec in sync with the source.

---

## Solution

A CLI tool that converts OpenAPI specs into a compact, token-efficient format, paired with a GitHub Action that keeps the output in sync automatically.

### The CLI

`spec-mind` takes a directory or file and produces a `.mind` alongside each spec. It operates in **sync mode**: processes the entire directory on every run, deletes outputs for removed sources, and handles renames. The output is a compact, schema-aware specification for LLM consumption — not a contract replacement, but a faithful compressed representation that preserves type fidelity, constraints, and operation semantics.

**v1 supports:**
- OpenAPI 3.0 / 3.1 (REST, request/response)

**Planned for v2:**
- AsyncAPI 2.x / 3.x (WebSocket, Kafka, AMQP, MQTT, event-driven)

**The compact format retains what is load-bearing for LLM reasoning:**
- Endpoint identifier, method, and parameter list with location (path/query/header/cookie), type, required vs. optional, and constraints
- Request payload schema with required vs. optional fields, `readOnly`/`writeOnly`, nullable vs. absent
- Response shapes for success and notable error codes (with body shape, not just status)
- Response headers that carry API contract information (Location, ETag, Retry-After, rate-limit headers)
- Auth/security scheme per operation, with scope-level detail
- Schema definitions with full type fidelity including `allOf`/`oneOf`/`anyOf`, discriminators, and deprecation markers
- Non-JSON content types flagged explicitly

**Stripped out:** prose descriptions that restate the field name, all `example` blocks, server boilerplate, cosmetic metadata. See FORMAT_SPEC.md Section 14 for the complete list.

Every output file carries a header:
```
# COMPACT INDEX — navigational summary only. Do not derive contracts from this file.
# Source: openapi.yaml | Generated: <timestamp> | Spec version: <info.version>
```

Under the hood: `@apidevtools/swagger-parser` for OpenAPI parsing and `$ref` resolution; Redocly CLI for spec bundling.

### The GitHub Action

The Action wraps the CLI with two modes:

**Validate mode (default):** Fails CI if the committed `.mind` does not match what the converter would produce from the current source. The converter produces canonical, deterministic output — field and enum ordering follows the source spec, and two runs on the same spec produce identical bytes. Any difference is a failure. Same pattern as `gofmt` or `prettier --check`. Works with branch-protected `main`, produces no auto-commits, keeps history clean.

**Generate mode (opt-in):** Runs the sync and commits outputs back. Suitable for feature branches or teams that explicitly accept the auto-commit tradeoffs. Guarded against CI loops via commit message sentinel.

The Action posts a spec diff summary to `$GITHUB_STEP_SUMMARY` on every run and always exposes `workflow_dispatch` for manual regeneration.

A `.pre-commit-config.yaml`-compatible hook is provided so teams can generate locally before committing, making CI purely a verification step.

### Tech Stack

- TypeScript/Node.js
- `@apidevtools/swagger-parser` — OpenAPI parsing, `$ref` resolution, and spec bundling
- Redocly CLI — spec bundling for pre-processing modular specs with external `$refs`
- `commander` — CLI arg parsing
- `@actions/core` — GitHub Action SDK
- Distribution: npm (CLI), GitHub Marketplace (Action), binary releases

### Success Criteria

- 80%+ token reduction vs. source spec on a realistic API
- API calls constructed from the compact format match the source spec for all in-scope required/optional fields, parameter locations, and types (see FORMAT_SPEC.md Section 16 for known limitations)
- Deleted/renamed source files always result in deleted/renamed outputs (no orphans)
- Local CLI output is identical to CI output
- Default validate mode works with branch-protected `main` out of the box
