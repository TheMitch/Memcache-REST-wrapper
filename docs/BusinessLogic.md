Redis Cache REST API -- Tight Specification (Tag-based, Comma-separated Headers)
1. Purpose

Provide a generic HTTP API to store, retrieve, and invalidate cached objects backed by Redis.
Consumers MUST NOT depend on Redis concepts (keys, scans, commands).

Objects are identified independently from tags. Tags enable bulk invalidation.

2. Supported Payloads
2.1 Content types

The API MUST accept and store payloads for any Content-Type supplied by the caller.

2.2 Opaque storage

Payloads MUST be treated as opaque bytes/text.

The API MUST return the payload unchanged.

The API MUST preserve and return the original Content-Type.

3. Object Identity

Each cached object is uniquely identified by:

Field	Required	Rules
namespace	Yes	1..200 chars, URL-safe
id	Yes	1..200 chars, URL-safe

Object identity MUST NOT include tags.

4. Tags
4.1 Tag model

An object MAY have zero or more tags.

Tags are opaque strings; the API does not interpret business meaning.

4.2 Conventional tags

The following tag namespaces are conventional (not mandatory):

system:<value>

customer:<value>

4.3 Tag transmission -- Comma-separated header (REQUIRED)

Tags MUST be provided using a single request header:

Header name: X-Tag

The header value MUST be a comma-separated list of tags.

Example:

X-Tag: system:salto, customer:customer-42, region:eu

4.4 Tag replacement semantics

On PUT:

The provided tag set MUST fully replace any existing tag set for that object.

Tags MUST NOT be merged automatically.

4.5 Tag constraints (MUST be enforced)

The API MUST enforce:

Max tags per object: 50

Max tag length: 128

Allowed characters: printable ASCII excluding control characters (implementation may further restrict)

Tags MUST NOT contain commas (comma is the header separator)

Duplicate tags MUST be de-duplicated server-side (idempotent behavior)

5. TTL

TTL is OPTIONAL per object.

Provided as ttlSeconds query parameter (integer seconds).

If omitted: default TTL is 86,400 seconds (24 hours).

TTL expiry MUST behave as implicit invalidation. Once an object's TTL elapses, a subsequent GET MUST return 404 Not Found exactly as if the object had been explicitly invalidated.

Constraints:

ttlSeconds MUST be 1..31,536,000 (1 year) if provided.

6. Endpoints
6.1 Store (create/overwrite) object

PUT

/v1/objects/{namespace}/{id}?ttlSeconds={seconds}


Request:

Body: arbitrary payload (opaque bytes or text)

Content-Type: required; value persisted and returned as provided

Optional header: X-Tag: <tag>, <tag>, ...

Response:

201 Created on success

MUST be idempotent for identical input

Errors:

400 invalid namespace/id, invalid ttl, invalid tag format/limits

400 missing or invalid Content-Type

401 unauthorized (if auth enabled)

500 server error

6.2 Retrieve object

GET

/v1/objects/{namespace}/{id}


Response:

200 OK with the original payload and original Content-Type

SHOULD include tags as a comma-separated response header (recommended):

X-Tag: <tag>, <tag>, ...

404 Not Found if missing or TTL expired

Errors:

400 invalid namespace/id

401 unauthorized (if auth enabled)

500 server error

6.3 Invalidate (delete) single object

DELETE

/v1/objects/{namespace}/{id}


Response:

200 OK with { "deleted": true|false }

MUST be idempotent (deleted:false if already absent)

Errors:

400 invalid namespace/id

401 unauthorized (if auth enabled)

500 server error

6.4 Invalidate by single tag

DELETE

/v1/tags/{tag}


Semantics:

Invalidates all objects associated with {tag}.

MUST NOT affect objects that do not have the tag.

MUST be bounded and deterministic (no unbounded scans exposed to consumers).

Response:

200 OK with { "invalidated": true, "tag": "<tag>" } (counts optional)

Errors:

400 invalid tag / violates limits

401 unauthorized (if auth enabled)

500 server error

6.5 Invalidate by multiple tags

DELETE

/v1/tags?match=all|any&tag={tag1}&tag={tag2}&...


Rules:

match=all: invalidate objects having all provided tags (AND)

match=any: invalidate objects having any provided tag (OR)

At least 1 tag parameter MUST be provided

Tag constraints from Section 4.5 apply

Response:

200 OK with { "invalidated": true, "match": "all|any" } (counts optional)

Errors:

400 invalid query / invalid tags

401 unauthorized (if auth enabled)

500 server error

6.6 Health

GET

/v1/health


Response:

200 OK with { "status": "ok", "redis": "ok" }

6.7 API documentation

GET

/v1/docs

GET

/v1/docs/openapi.json

Response:

200 OK with Swagger UI HTML at `/v1/docs`

200 OK with OpenAPI 3.0 JSON at `/v1/docs/openapi.json`

7. Semantics & Guarantees
7.1 Idempotency

PUT with same payload + same tags + same ttlSeconds MUST result in the same state.

DELETE operations MUST be idempotent.

Tag de-duplication MUST ensure stable results.

7.2 Atomicity

Single-object operations MUST be atomic.

Bulk invalidation MUST have bounded guarantees and MUST be safe under concurrency.

8. Error Format

All non-2xx responses MUST return machine-readable JSON:

{ "error": "string", "details": "optional" }

9. Security

The API MUST support request authentication (e.g., API key header or equivalent).

When API key enforcement is enabled, clients MUST include `X-API-Key: <secret>` on every request. Missing or mismatched keys MUST yield 401 Unauthorized with the standard error envelope.

The API MUST NOT allow arbitrary Redis command execution.

Example URLs & Requests
A) Store JSON with multiple tags
PUT /v1/objects/reservations/abc123?ttlSeconds=900
Content-Type: application/json
X-Tag: system:salto, customer:customer-42, region:eu

B) Store XML with system tag only
PUT /v1/objects/config/global-rules?ttlSeconds=3600
Content-Type: application/xml
X-Tag: system:pms

C) Store with no tags
PUT /v1/objects/reference/countries
Content-Type: application/json

D) Retrieve an object
GET /v1/objects/reservations/abc123

E) Invalidate a single object
DELETE /v1/objects/reservations/abc123

F) Invalidate everything for a system
DELETE /v1/tags/system:salto

G) Invalidate everything for a customer
DELETE /v1/tags/customer:customer-42

H) Invalidate objects for a specific system+customer (AND)
DELETE /v1/tags?match=all&tag=system:salto&tag=customer:customer-42

I) Invalidate objects for either of two systems (OR)
DELETE /v1/tags?match=any&tag=system:salto&tag=system:pms

J) Open interactive API docs
GET /v1/docs

K) Fetch raw OpenAPI JSON
GET /v1/docs/openapi.json
