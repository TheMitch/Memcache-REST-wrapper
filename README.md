# memcache-api

Node.js implementation of the Redis-backed cache REST API described in `docs/BusinessLogic.md`.
For a technical architecture walkthrough and request-flow sequence diagrams, see `docs/Architecture.md`.

## Prerequisites
- Node.js 18+
- Redis instance accessible via `REDIS_URL`

## Setup
```
npm install
```

Copy `.env.example` to `.env` and adjust values as needed.

## Running
```
npm run start
```

Use `npm run dev` for live reload during development.

The service exposes:
- `PUT /v1/objects/{namespace}/{id}` to store payloads (any Content-Type) with optional `ttlSeconds` (defaults to 24h)
- `GET /v1/objects/{namespace}/{id}` to retrieve cached payloads and echo tags via comma-separated `X-Tag`
- `DELETE /v1/objects/{namespace}/{id}` to invalidate a single object
- `DELETE /v1/tags/{tag}` and `DELETE /v1/tags?match=all|any&tag=...` for tag-driven invalidation
- `GET /v1/health` for health checks
- `GET /v1/docs` for Swagger UI
- `GET /v1/docs/openapi.json` for the raw OpenAPI 3.0 spec

To save the OpenAPI spec as a valid JSON file on disk:
```
npm run openapi:json
```
This writes `src/openapi/spec.json`.

Error responses always follow `{ "error": "string", "details": "optional" }`.

## Deploying to Cloud Run with Memorystore
1. **Enable APIs & set defaults**
   ```
   gcloud config set project <PROJECT_ID>
   gcloud services enable run.googleapis.com artifactregistry.googleapis.com redis.googleapis.com vpcaccess.googleapis.com
   ```
2. **Build and publish the container**
   ```
   gcloud builds submit --tag us-central1-docker.pkg.dev/<PROJECT_ID>/memcache/memcache-api:latest
   ```
   (Replace region/repo names to match your Artifact Registry.)
3. **Provision Memorystore for Redis** (must be in the same region/VPC as Cloud Run)
   ```
   gcloud redis instances create memcache-cache --region=us-central1 --tier=BASIC --size=1 --network=default
   gcloud redis instances describe memcache-cache --region=us-central1 --format="value(host)"
   ```
   Use the returned host to build `REDIS_URL=redis://<HOST>:6379`.
4. **Create a Serverless VPC Access connector** so Cloud Run can reach the private Memorystore IP:
   ```
   gcloud compute networks vpc-access connectors create memcache-connector \
     --region=us-central1 --network=default --range=10.8.0.0/28
   ```
5. **Deploy Cloud Run**
   ```
   gcloud run deploy memcache-api \
     --image us-central1-docker.pkg.dev/<PROJECT_ID>/memcache/memcache-api:latest \
     --region=us-central1 \
     --allow-unauthenticated \
     --vpc-connector memcache-connector \
     --set-env-vars REDIS_URL=redis://<HOST>:6379,API_KEY=<OPTIONAL_KEY>
   ```
   Cloud Run automatically sets `PORT`, which the app already honors. Adjust memory/CPU and authentication flags as needed.

### Automated deployment script
A Google Cloud-specific PowerShell helper script lives at `scripts/deploy-google-cloudrun.ps1`. Example usage:
```
pwsh ./scripts/deploy-google-cloudrun.ps1 -ProjectId my-project -Region us-central1 -ServiceName memcache-api
```
By default, the script reads `API_KEY` from `.env` (repo root) and then from the process environment variable `API_KEY`. You can still override explicitly with `-ApiKey <value>`.
It uses Cloud Build by default (and will automatically fall back to Docker if Cloud Build hits SSL interception issues), but you can append `-BuildStrategy Docker` to force a local build/push. The Docker path requires Docker Desktop/Engine to be running beforehand.
If your network requires a custom root certificate, pass `-CustomCaCertPath C:\path\corp-ca.pem` and the script will configure `gcloud` to use it before building.

For macOS/Linux, use:
```
chmod +x ./scripts/deploy-google-cloudrun.sh
./scripts/deploy-google-cloudrun.sh --project-id my-project --region us-central1 --service-name memcache-api
```
The Bash script supports equivalent options (`--build-strategy`, `--api-key`, `--artifact-repo`, etc.) and the same API key resolution order.

`scripts/deploy-cloudrun.ps1` remains as a compatibility wrapper and forwards to `deploy-google-cloudrun.ps1`.

It will:
- enable required APIs
- create the Artifact Registry repo if needed
- build & push the container
- create a Memorystore Redis instance (or reuse an existing one)
- provision a Serverless VPC connector if missing
- deploy the Cloud Run service with the proper `REDIS_URL` (and optional `API_KEY`)
