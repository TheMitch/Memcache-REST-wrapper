# memcache-api Architecture and Request Flow

This document explains how the service is structured and how requests flow through the system.

## High-Level Components
- `src/server.js`: starts HTTP server and initializes Redis connection.
- `src/app.js`: wires middleware and routes.
- `src/middleware/auth.js`: enforces API key authentication via `X-API-Key` when configured.
- `src/routes/*.js`: HTTP endpoints for objects, tags, health, and docs.
- `src/services/cacheService.js`: core Redis interactions and invalidation logic.
- `src/storage/redisClient.js`: shared `ioredis` client.
- `src/utils/validation.js`: request/path/tag/TTL validation.

## Data Model in Redis
- Object key: `obj:{namespace}:{id}`
- Tag index key: `tag:{base64url(tag)}`
- Object value (JSON-serialized):
  - `payload` (base64-encoded bytes)
  - `contentType` (original `Content-Type`)
  - `tags` (deduplicated tag array)

## Runtime Request Pipeline
1. Request enters Express app (`helmet`, `morgan`).
2. Auth middleware checks `X-API-Key` if API key is configured.
3. Route validates identifiers/tags/TTL/content type.
4. Route calls cache service.
5. Cache service reads/writes Redis object keys and tag index sets.
6. Route returns API response (or standard error envelope on failure).

## Sequence Diagrams (Mermaid)

### Store Object (`PUT /v1/objects/{namespace}/{id}`)
```mermaid
sequenceDiagram
    autonumber
    participant C as Client
    participant A as API (Express)
    participant V as Validation
    participant S as CacheService
    participant R as Redis

    C->>A: PUT /v1/objects/ns/id?ttlSeconds=900\nX-API-Key, X-Tag, Content-Type, body
    A->>A: Auth middleware verifies X-API-Key
    A->>V: Validate namespace/id/contentType/tags/ttl
    V-->>A: Normalized input
    A->>S: putObject(...)
    S->>R: GET obj:ns:id (existing object)
    R-->>S: existing value / null
    S->>R: SET obj:ns:id serialized EX 900
    S->>R: SREM removed tag indexes (if tags changed)
    S->>R: SADD added tag indexes
    S-->>A: success
    A-->>C: 201 Created {namespace,id,ttlSeconds,tags}
```

### Retrieve Object (`GET /v1/objects/{namespace}/{id}`)
```mermaid
sequenceDiagram
    autonumber
    participant C as Client
    participant A as API (Express)
    participant V as Validation
    participant S as CacheService
    participant R as Redis

    C->>A: GET /v1/objects/ns/id\nX-API-Key
    A->>A: Auth middleware verifies X-API-Key
    A->>V: Validate namespace/id
    V-->>A: Normalized values
    A->>S: getObject(namespace,id)
    S->>R: GET obj:ns:id
    R-->>S: serialized object / null
    alt Object exists
        S-->>A: payload + contentType + tags
        A-->>C: 200 OK (raw body, Content-Type, optional X-Tag)
    else Missing/expired
        S-->>A: null
        A-->>C: 404 {error:"not_found",details:"Object not found"}
    end
```

### Invalidate by Tags (`DELETE /v1/tags?match=all|any&tag=...`)
```mermaid
sequenceDiagram
    autonumber
    participant C as Client
    participant A as API (Express)
    participant V as Validation
    participant S as CacheService
    participant R as Redis

    C->>A: DELETE /v1/tags?match=all&tag=t1&tag=t2\nX-API-Key
    A->>A: Auth middleware verifies X-API-Key
    A->>V: Validate tags + match
    V-->>A: Normalized tags/match
    A->>S: invalidateByTags(tags,match)
    S->>R: SINTER or SUNION membership sets
    R-->>S: matching object keys
    loop each matching object key
        S->>R: GET object value
        S->>R: DEL object key
        S->>R: SREM object key from all referenced tag sets
    end
    S->>R: Cleanup empty tag sets
    S-->>A: invalidatedCount
    A-->>C: 200 {invalidated,match,count}
```

## Operational Notes
- TTL expiry in Redis acts as implicit invalidation; expired objects are returned as 404.
- Tag indexes are maintained on write and delete to keep invalidation bounded and deterministic.
- All errors use `{ "error": "string", "details": "optional" }`.
