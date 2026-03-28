# spec-mind Format Specification

This document defines the compact `.mind` notation produced by the spec-mind converter. It is the technical contract between the format design and the converter implementation. Any change to the format must be reflected here before the converter code changes.

**Scope:** OpenAPI 3.0 and 3.1 (REST/HTTP). AsyncAPI is out of scope for this version.

See **Section 16** for a complete list of known limitations and intentionally deferred features.

---

## 1. File Header

Every `.mind` file begins with a required header block:

```
# COMPACT INDEX — navigational summary only. Do not derive contracts from this file.
# Source: <relative path to source spec> | Generated: <ISO 8601 timestamp> | Spec version: <info.version>
# API: <info.title> — <servers[0].url>
# Servers: <label>=<url> [, <label>=<url>...]
# NOTATION: ? optional  [ro] readOnly  [w] writeOnly  =val default
#           ^ header  ~cookie  *N multipleOf N  | enum or nullable
#           OneOf<A,B> on field = discriminated union
#           {*:T} = map/dict  {...} = open object  extends = allOf
#           & = inline extension  ~~name~~ = deprecated  # = inline note
#           [multipart] [form] [binary] [text] = request body encoding
```

- `Source` is the path relative to the repo root
- `Generated` is the UTC timestamp of conversion
- `Spec version` is the value of `info.version` from the source spec
- If `servers[0].url` contains variable placeholders (e.g. `https://{environment}.api.example.com/v1`), substitute each variable with its `default` value from `servers[0].variables`. If no default is defined for a variable, emit the placeholder as-is.
- `Servers` lists all available servers when multiple are defined. Format: `label=url` pairs separated by commas. The label is the server's `description` field, or a derived name from the URL host. If multiple servers share the same label, append numbers (e.g., `Production=...`, `Production 2=...`). URLs have variables substituted with default values. If only one server is defined, the `Servers` line is omitted.
- The `NOTATION` lines are a fixed legend — include verbatim in every output file

---

## 2. File Structure

```
# <header block with notation legend>

[global auth if defined]

## <Tag Name>
<endpoint blocks>

## <Tag Name>
<endpoint blocks>

## Schemas
<schema definition lines>
```

- Endpoints are grouped by their first `tags` entry
- Endpoints with no tags go under `## (untagged)`
- The `## Schemas` section is always last
- A blank line separates each endpoint block within a tag section

### Output Serialization

The converter must produce deterministic output that satisfies a byte-for-byte comparison across runs on the same source spec:

- **Indentation:** 2 spaces. No tabs.
- **Trailing whitespace:** none on any line.
- **End of file:** exactly one trailing newline (`\n`).
- **Quoting:** values are unquoted unless they contain characters that require quoting in the `.mind` format. Only enum constants (`type:"credit_card"`) and string literal defaults with special characters use quotes. Plain identifiers, type names, and constraint expressions are never quoted.
- **Comments:** all comment lines begin with `# ` (hash followed by a single space). The header block comments are the only comment lines in the file, except for inline notes appended to `->` lines (`# application/pdf`).
- **Blank lines:** one blank line between the header block and the first content section; one blank line between tag sections; no blank lines within a schema line.
- **Notation-stripped mode:** When invoked with `--no-notation`, the converter omits the six `NOTATION` legend lines from the header. Only the three metadata comment lines (`COMPACT INDEX`, `Source/Generated`, `API`) are emitted. Use this flag when injecting multiple specs into the same LLM context to avoid repeating the legend on every file. Both modes produce valid `.mind` output.

---

## 3. Parameter Locations

This section defines all parameter prefix notation. Learn these before reading endpoint syntax.

```
{productId:uuid}            path parameter — always required, type annotated in the path
?page:int=1                 query parameter, optional, with default
status                      query parameter, required (no ? prefix)
^X-Idempotency-Key          header parameter, required
^?X-Request-Id:uuid         header parameter, optional, typed
~session                    cookie parameter, required
~?theme                     cookie parameter, optional
```

Standard headers that every HTTP client handles automatically (`Content-Type`, `Accept`, `Authorization` when covered by the auth scheme) are not emitted as explicit parameters.

---

## 4. Endpoint Lines

```
METHOD /path/{param:type}  [content-type flag if not JSON]  [auth if different from global]
  <parameters line>
  <body line>
  -> <status>: <response shape>
     headers: <response headers>
```

- Method is uppercase: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`
- Parameters line is omitted if there are no parameters beyond path params with no extra constraints
- Body line is omitted for methods that do not accept a body
- One endpoint block per operation (each method on a path is a separate block)
- If an operation is deprecated, prefix the method with `~~`: `~~GET~~ /path`

### Parameters line

All parameters appear on a single line, comma-separated, in order: path params (only if they have extra constraints beyond the type), then query, then header, then cookie.

```
  ?page:int=1, ?limit:int=20(<=100), ^X-Idempotency-Key
```

Path parameters are already visible in the path itself. Only include them in the parameters line if they have constraints beyond the type (e.g., `{id:uuid}` in the path is sufficient; add a params line only if `minLength`, `pattern`, or similar apply).

### Body line

```
  body: SchemaName
  body: {field:type, field2?:type}
  body: SchemaName  [multipart]
```

Use a schema name reference when the request body is a named component schema. Use inline notation only for simple anonymous bodies with 4 or fewer fields.

---

## 5. Type Notation

### Primitive types

| JSON Schema type | format | Compact notation |
|---|---|---|
| `string` | (none) | _(omit — plain string is the default type)_ |
| `string` | `date` | `:date` |
| `string` | `date-time` | `:datetime` |
| `string` | `password` | `:password` |
| `string` | `byte` | `:base64` |
| `string` | `binary` | `:binary` |
| `string` | `email` | `:email` |
| `string` | `uuid` | `:uuid` |
| `string` | `uri` | `:uri` |
| `string` | `hostname` | `:hostname` |
| `string` | `ipv4` | `:ipv4` |
| `string` | `ipv6` | `:ipv6` |
| `integer` | (none) | `:int` |
| `integer` | `int32` | `:int32` |
| `integer` | `int64` | `:int64` |
| `number` | (none) or `float` | `:float` |
| `number` | `double` | `:double` |
| `boolean` | — | `:bool` |
| `array of T` | — | `T[]` |
| `object` | — | `{...}` inline or `SchemaName` ref (see Section 9) |
| `{}` (empty schema) | — | `:any` |

When a field has no `type` specified in the source schema, treat it as `string` (omit the type annotation).

---

## 6. Constraints

Constraints are appended in parentheses immediately after the type annotation. Multiple constraints are comma-separated within the parens.

### Numeric constraints
```
field:int(>=0)              minimum: 0  (inclusive)
field:int(<=100)            maximum: 100  (inclusive)
field:int(>0)               exclusiveMinimum
field:int(<100)             exclusiveMaximum
field:int(>=1,<=999)        minimum + maximum
field:float(*0.01)          multipleOf: 0.01  (* means "must be a multiple of")
field:int(>=0,*5)           minimum + multipleOf combined
```

### String constraints
```
field(min:1)                minLength: 1
field(max:255)              maxLength: 255
field(1..255)               minLength + maxLength combined (shorthand)
field(pattern:^\d{4}$)      pattern (include the regex inline)
```

If a pattern exceeds 60 characters, truncate with `...` and append `[see source]`:
```
field(pattern:^[A-Za-z0-9+/]...[see source])
```

### Array constraints
```
T[](min:1)                  minItems: 1
T[](max:10)                 maxItems: 10
T[](1..10)                  minItems + maxItems combined
T[](unique)                 uniqueItems: true
T[](1..10,unique)           all three combined
```

### Object constraints (maps only)
```
{*:string}(min:1,max:10)    minProperties + maxProperties on a map type
```

### Formal constraint grammar

```
constraint_list  := constraint (',' constraint)*
constraint       := numeric_cmp | multipleOf | str_length | pattern | array_len | 'unique'

numeric_cmp      := ('>=' | '<=' | '>' | '<') number
multipleOf       := '*' number
str_length       := shorthand_len | keyword_len
shorthand_len    := number '..' number          (minLength..maxLength)
keyword_len      := 'min:' number | 'max:' number
pattern          := 'pattern:' regex
array_len        := shorthand_len | keyword_len  (same syntax, context is array)
```

Rules:
- Shorthand (`1..255`) and keyword form (`min:1, max:255`) may not be mixed within a single constraint list
- Constraint order within the parens is not significant
- Numeric, string, and array constraints use the same syntax in their respective contexts

---

## 7. Field Modifiers

Modifiers stack on the field in this order: `name` `?` `:type` `|null` `[ro]` or `[w]` `=default` `(constraints)`.

```
field                       required, string
field?                      optional, string
field:int                   required integer
field?:int                  optional integer
field:int|null              required, nullable (value may be explicitly null)
field?:int|null             optional and nullable
field:int[ro]               required, readOnly — present in responses, must not be sent in requests
field:int[w]                required, writeOnly — accepted in requests, never returned in responses
field?:int[ro]              optional, readOnly
field:int=0                 required, server-side default 0 (field may be absent; server fills it in)
field?:int=20               optional, fallback default 20 (if omitted, server behaves as if 20 was sent)
field?:int=20(1..100)       optional, fallback default 20, constrained to 1-100
~~field~~                   deprecated — still emitted but marked; check source spec for replacement
~~field~~?:uuid             deprecated optional field
```

**Key distinctions:**
- `?` (optional) — the field may be absent entirely
- `|null` (nullable) — the field must be present but its value may be `null`
- A field that is both optional and nullable uses `?:type|null`
- `[ro]` and `[w]` describe request/response direction, not requiredness
- `field:int=0` is server-side default: the field is technically optional in the request but the server will substitute the default. Use `field?:int=20` when the default is a client-visible fallback.

**Rule for default values:** The converter determines whether to emit `?` by checking the source schema's `required` array:
- If the field **is** in `required`: emit `field:type=default` (the server fills it in if absent)
- If the field **is not** in `required`: emit `field?:type=default` (the field is optional; the default is the server's fallback)

This means a field with `default` but not in `required` always gets `?`.

---

## 8. Enum Notation

Enum values are pipe-separated and follow the type annotation:

```
status:pending|confirmed|shipped|delivered|cancelled    string enum (type explicit)
category:electronics|books|clothing                     string enum (type omitted)
priority:low|medium|high                                string enum (type omitted)
code:int:200|201|400|404|500                            integer enum
direction:int:1|-1                                      signed integer enum
```

When the enum contains only one value (a constant), render it as a quoted literal:
```
type:"credit_card"          constant string — always this value
```

**Ordering:** Enum values are emitted in source order (the order listed in the OpenAPI `enum` array). Do not sort or reorder enum values. oneOf/anyOf members in `OneOf<>/AnyOf<>` are likewise emitted in source order.

**Nullable enums:** When a field is both an enum and nullable, append `|null` at the end of the enum list:
```
status:active|inactive|null     nullable enum — value is one of the listed strings, or null
```
The trailing `|null` is always the nullable marker, never a literal string enum value. If the source spec contains a literal `"null"` string in its `enum` array, treat it as the nullable marker.

### Enum Alias Registry (optional)

When the same enum appears in three or more locations in the output, a `[enums:]` block may be declared at the start of the `## Schemas` section to assign a reusable alias:

```
[enums: Currency=USD|EUR|GBP|JPY, RefundReason=duplicate|fraudulent|customer_request|other]

Payment:              {id:uuid[ro], amount:float, currency:Currency, ...}
CreatePaymentRequest: {amount:float(>=0.01), currency:Currency, method:PaymentMethod}
Refund:               {id:uuid[ro], ..., reason?:RefundReason}
```

Rules:
- Alias names must start with an uppercase letter to distinguish them from field names and primitive types
- Inline enum syntax remains valid everywhere — aliases are purely optional
- An alias is appropriate only when the exact same enum set appears in 3 or more locations; for fewer uses, inline the enum directly
- Aliases are file-scoped; they may not be referenced across files
- The `[enums:]` block is always the first line in `## Schemas`, before any named schema definitions
- To mark an aliased field nullable, append `|null` at the use site, not in the alias definition: `status?:PaymentStatus|null`

---

## 9. Special Object Types

### Closed object (default)
```
{field, field2:int, field3?:bool}
```
An object with no `additionalProperties`, or `additionalProperties: false`. All properties are listed.

### Open object
```
{field, ...}
```
An object where `additionalProperties: true` and some named properties are defined. The `...` signals extra keys are permitted beyond the listed ones.

For an object with **no named properties** and `additionalProperties: true` (shape entirely unknown):
```
{...}
```
Use `{...}` when the shape is genuinely open and variable — no named properties, any key-value pairs allowed.

### Map / dictionary
```
{*:string}                  additionalProperties: {type: string}
{*:int}                     additionalProperties: {type: integer}
{*:SchemaName}              additionalProperties: {$ref: SchemaName}
{*}                         additionalProperties: {} (any values — empty schema)
```

**Choosing between `{...}`, `{*:T}`, and `{*}`:**
- Use `{*:T}` when `additionalProperties` is a typed schema (e.g. `{type: string}`)
- Use `{...}` when `additionalProperties: true` with no named properties, or with named properties plus extras allowed
- Use `{*}` only when `additionalProperties` is an empty schema `{}`

Maps may carry constraints:
```
{*:string}(min:1,max:20)    map with 1-20 entries
```

### Inline vs. schema reference rule

Use inline notation if and only if **both** conditions hold:
1. The object type is referenced in exactly **one location** across the entire spec (one endpoint parameter, one response shape, or one property in one named schema), AND
2. The object has **4 or fewer fields**

If the same structure is used in two or more locations, define it as a named schema in `## Schemas`, even if it has 4 or fewer fields.

**Edge case — allOf base schemas:** Schemas used as `allOf` bases (referenced via `extends`) are always emitted as named schemas regardless of how many times they appear. The `extends` notation requires a named reference; they cannot be inlined.

**Edge case — array item schemas:** The one-location rule applies to array item schemas the same way it applies to regular objects. An anonymous object used as the item type of exactly one array, with 4 or fewer fields, may be inlined: `{ruleId:uuid, ruleName, impact:double}[]`.

**Edge case — anonymous schemas:** If a schema is anonymous in the OpenAPI source (defined inline, no `$ref`, no entry in `components/schemas`), keep it inline regardless of field count. Do not extract and name anonymous schemas.

**Exception:** The open-object placeholder `{...}` and the map notation `{*:T}` may appear in multiple locations when the actual shape is genuinely unknown or variable. Named schema definition is not required for these.

Recursive schemas must always use named references — they cannot be inlined.

**Ordering:** Fields within inline objects and named schemas are emitted in source order (the order they appear in the OpenAPI `properties` object). Do not reorder or sort fields.

**Implementation note:** Determining whether a schema is used in exactly one location requires a complete first pass over the entire spec to resolve and count all `$ref` references. The converter must resolve the full schema graph before emitting any output.

---

## 10. Auth / Security

Global security is declared once at the top of the file, below the header block:

```
[auth: bearer]
[auth: oauth2 payments:read,payments:write]
[auth: apikey header X-Api-Key]
[auth: apikey query api_key]
```

Per-operation overrides appear at the end of the endpoint's method line:

```
GET /health  [auth: none]
POST /payments  [auth: oauth2 payments:write]
```

**Rules:**
- `[auth: none]` must be emitted explicitly on public endpoints when a global auth scheme is defined
- When an operation uses the same scheme but with narrower scopes than the global, emit the per-operation override for clarity: `GET /payments [auth: oauth2 payments:read]` when global is `payments:read,payments:write`
- When multiple security schemes are defined globally, emit the most broadly used one globally and annotate all exceptions per operation

---

## 11. Schema Composition

### allOf — inheritance or intersection

Named base with no extra fields:
```
RefundRequest extends BaseRequest
```

Named base with additional fields:
```
RefundRequest extends BaseRequest & {amount:float(>0), reason?}
```

Fully inline (when base is small and used only once):
```
{id:uuid[ro], timestamp:datetime[ro]} & {amount:float, reason?}
```

### oneOf — exactly one matching schema

Without discriminator:
```
PaymentMethod: Dog | Cat
```

With discriminator field:
```
PaymentMethod: OneOf<CreditCardPayment, BankTransferPayment, CryptoPayment> on type
```

### anyOf — one or more matching schemas

```
Filter: AnyOf<DateFilter, RangeFilter, TextFilter>
```

### Recursive schemas

A schema that references itself uses its own name. Recursive schemas must always be named — never inline:
```
Category: {id:uuid[ro], name, parent?:uuid, children:Category[]}
```

All schema names in the `## Schemas` section are considered pre-declared, so forward and self-references are always valid.

---

## 12. Response Notation

Each response status code appears on its own `->` line. Do not use `|` to join multiple responses inline.

```
-> 200: Product
-> 200: Product[]
-> 200: {total:int, items:Product[]}
-> 201: Payment
-> 204
-> 400: ValidationErrorResponse
-> 404: {error, message, code}
-> 400,422: {error, message, fields:{*:string[]}}
```

- Body shapes follow the same inline vs. reference rule as Section 9
- `204` and any other codes that guarantee no response body per HTTP semantics are emitted without a `: Type`
- When multiple error codes share the same body shape, group them with a comma: `-> 400,422: ErrorResponse`
- Comma-grouped status codes are always sorted numerically ascending: `-> 400,422`, never `-> 422,400`
- Emit a body shape for every code that has one; omit only when there is genuinely no body
- Response codes are emitted in numerically ascending order (200, 201, 400, 422, 429, ...)

### 12.1 Response Headers

When a response carries headers that are meaningful for the caller (not just standard HTTP infrastructure), include a `headers:` line indented under the `->` line:

```
-> 201: Payment
   headers: Location:uri[ro]
-> 200: Resource
   headers: ETag[ro], Last-Modified:datetime[ro]
-> 429: ErrorResponse
   headers: Retry-After:int[ro]
-> 200: {data:Item[]}
   headers: X-RateLimit-Limit:int[ro], X-RateLimit-Remaining:int[ro], X-RateLimit-Reset:datetime[ro]
```

Rules:
- All response headers are inherently readOnly — `[ro]` is always appended
- Format: `HeaderName:type[ro]` (type omitted if plain string)
- Multiple headers on the same line, comma-separated
- Include: `Location`, `ETag`, `Last-Modified`, `Retry-After`, `X-RateLimit-*`, any domain-specific response headers that a caller would use
- Omit: `Content-Type`, `Content-Length`, `Date`, `Server`, and other standard headers every client handles automatically
- Link headers (pagination) are listed in Known Limitations (Section 16)

---

## 13. Content Type Flags

Content-type flags annotate **request body** encoding only — they signal how to serialize the body being sent. They appear on the method line before any auth override. Do not use them to describe response content types.

For non-JSON **responses**, the converter reads the `content.<media-type>` key from the OpenAPI response definition and maps it automatically:

| Response content type           | Compact type  | Inline note appended?           |
|---------------------------------|---------------|---------------------------------|
| `application/json` (or `*+json`)| schema type   | never (JSON is the default)     |
| `application/octet-stream`      | `binary`      | no (type is self-describing)    |
| `application/pdf`               | `binary`      | yes: `# application/pdf`        |
| `image/*` (png, jpeg, gif, webp)| `binary`      | yes: `# image/png` etc.         |
| `text/plain`                    | `string`      | yes: `# text/plain`             |
| `text/csv`                      | `string`      | yes: `# text/csv`               |
| `text/html`                     | `string`      | yes: `# text/html`              |
| any other type                  | `binary`      | yes: `# <media-type>`           |

The inline note is appended whenever the media type carries information the caller needs beyond what the compact type conveys alone. Omit only for `application/json` and `application/octet-stream`.

```
-> 200: binary  # application/pdf
-> 200: binary  # image/png
-> 200: string  # text/csv
```

Content-type flags on the method line:
```
POST /documents  [multipart]
POST /upload  [binary]
PUT /config  [text]
POST /form  [form]
```

| Flag | Content-Type |
|---|---|
| `[multipart]` | `multipart/form-data` |
| `[form]` | `application/x-www-form-urlencoded` |
| `[binary]` | `application/octet-stream` |
| `[text]` | `text/plain` |

Vendor types are emitted verbatim. If over 60 characters, truncate with `...` and append `[see source]`:
```
POST /events  [application/vnd.company.event+json]
POST /legacy  [application/vnd.co.v2+json;ver=2...[see source]]
```

---

## 14. What Is Always Stripped

The following are never included in the compact output:

- `description` fields — unless the description contains information not representable by the schema syntax itself (e.g., non-obvious units, domain-specific rules). In that case, append an inline note:
  ```
  amount:float  # in cents, not dollars
  expiration:date  # YYYY-MM-DD, vendor-specific
  ```
  Notes are separated by `#`, kept to one line, and under 60 characters.
- All `example` and `examples` blocks
- `title` fields on schemas and properties
- `$schema` and `$id` metadata
- `externalDocs` references
- `xml` annotations
- `servers` block — server URLs are shown in the file header (`# API:` line for primary server, `# Servers:` line for additional servers when multiple are defined)
- `info` block beyond `title` and `version`
- `x-` extension fields (vendor extensions)

---

## 15. Deprecation

Deprecated items are emitted in their original position in the output. They are never moved, grouped, or removed.

Deprecated operations — prefix the HTTP method with `~~`:
```
~~GET~~ /payments/legacy/{id}
```

Deprecated fields — wrap the field name with `~~`:
```
~~legacyId~~?:uuid
```

Deprecated parameters — same as fields, wrap the parameter name:
```
~~?X-Old-Header~~
```

Deprecated schemas — prefix the schema name with `~~`:
```
~~LegacyPayment~~: {id:uuid[ro], amount:float}
```

---

## 16. Known Limitations (v1)

The following OpenAPI features are intentionally not represented in this version. Implementors should document these gaps when shipping the converter; LLM consumers should refer to the source spec for anything in this list.

**Response and request mechanics:**
- Response `Link` header (RFC 8288 pagination and HATEOAS relations)
- Parameter serialization `style` and `explode` (how arrays are encoded in query strings and paths: `?ids=1,2` vs `?ids=1&ids=2`)
- Multiple request body content types per operation (e.g., an endpoint accepting both JSON and multipart)
- Request/response encoding rules (`encoding` object in multipart bodies)

**API patterns:**
- OpenAPI `links` object (runtime expressions for operation chaining)
- Callbacks
- Server-sent events and streaming responses
- Server URL variables (`{environment}` in server URLs)

**Security schemes:**
- HTTP basic auth
- HTTP digest auth
- Mutual TLS
- OpenID Connect (OIDC) discovery
- Combined security requirements (scheme A AND scheme B, or A OR B)

**OpenAPI 3.1-specific:**
- Top-level `webhooks`
- `$dynamicRef` / `$dynamicAnchor`
- `unevaluatedProperties` / `unevaluatedItems`
- `prefixItems` (tuple validation)
- `$ref` with sibling keywords

**JSON Schema advanced keywords:**
- `not`
- `if` / `then` / `else`
- `const` (emit as a single-value enum instead: `field:"value"`)
- `dependentRequired` / `dependentSchemas`
- `contentEncoding` / `contentMediaType`

**Other:**
- XML serialization (`xml` object)
- External `$ref` files: only intra-spec `$ref` is resolved. When the converter encounters an unresolvable external `$ref`, it must **fail with a clear error message** identifying the unresolved reference path. To use spec-mind with a modular spec, pre-process it into a single bundled file first (e.g. `swagger-parser bundle openapi.yaml -o bundled.yaml` or `redocly bundle openapi.yaml -o bundled.yaml`).
