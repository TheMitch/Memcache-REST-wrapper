#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID=""
REGION="europe-west4"
SERVICE_NAME="memcache-api"
IMAGE_TAG="latest"
REDIS_TIER="BASIC"
REDIS_SIZE_GB="1"
VPC_CONNECTOR_RANGE="10.8.0.0/28"
ARTIFACT_REPO="memcache"
BUILD_STRATEGY="CloudBuild"
API_KEY_OVERRIDE=""
CUSTOM_CA_CERT_PATH=""

usage() {
  cat <<'EOF'
Usage:
  ./scripts/deploy-google-cloudrun.sh --project-id <PROJECT_ID> [options]

Options:
  --project-id, -p          GCP project id (required)
  --region, -r              Region (default: europe-west4)
  --service-name            Cloud Run service name (default: memcache-api)
  --image-tag               Container image tag (default: latest)
  --redis-tier              Memorystore tier (default: BASIC)
  --redis-size-gb           Memorystore size in GB (default: 1)
  --vpc-connector-range     CIDR for Serverless VPC connector (default: 10.8.0.0/28)
  --artifact-repo           Artifact Registry repo name (default: memcache)
  --api-key                 API key override (optional)
  --custom-ca-cert-path     Path to custom CA cert for gcloud (optional)
  --build-strategy          CloudBuild or Docker (default: CloudBuild)
  --help, -h                Show this help

API key resolution order:
  1) --api-key
  2) .env file at repo root (API_KEY=...)
  3) API_KEY environment variable
EOF
}

trim() {
  printf '%s' "$1" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//'
}

get_dotenv_value() {
  local file_path="$1"
  local key="$2"
  local line raw_key raw_value value

  [[ -f "$file_path" ]] || return 1

  while IFS= read -r line || [[ -n "$line" ]]; do
    line="$(trim "$line")"
    [[ -z "$line" || "${line:0:1}" == "#" ]] && continue
    [[ "$line" != *"="* ]] && continue

    raw_key="${line%%=*}"
    raw_value="${line#*=}"
    raw_key="$(trim "$raw_key")"
    [[ "$raw_key" != "$key" ]] && continue

    value="$(trim "$raw_value")"
    if [[ "$value" == '"'*'"' ]] || [[ "$value" == "'"*"'" ]]; then
      value="${value:1:${#value}-2}"
    fi
    printf '%s' "$value"
    return 0
  done < "$file_path"

  return 1
}

run_gcloud() {
  echo "Running: gcloud $*"
  gcloud "$@"
}

run_docker() {
  echo "Running: docker $*"
  docker "$@"
}

ensure_gcloud() {
  if ! command -v gcloud >/dev/null 2>&1; then
    echo "ERROR: gcloud CLI not found. Install Google Cloud SDK first." >&2
    exit 1
  fi
}

ensure_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "ERROR: Docker CLI not found. Install Docker Desktop/Engine and ensure it is running." >&2
    exit 1
  fi
  if ! docker info --format '{{json .ServerVersion}}' >/dev/null 2>&1; then
    echo "ERROR: Docker CLI is installed but cannot reach the Docker daemon." >&2
    exit 1
  fi
}

get_redis_host() {
  local instance_name="$1"
  local region="$2"
  local host
  host="$(gcloud redis instances describe "$instance_name" --region="$region" --format='value(host)' 2>/dev/null | head -n 1 | tr -d '[:space:]')"
  printf '%s' "$host"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project-id|-p)
      PROJECT_ID="${2:-}"
      shift 2
      ;;
    --region|-r)
      REGION="${2:-}"
      shift 2
      ;;
    --service-name)
      SERVICE_NAME="${2:-}"
      shift 2
      ;;
    --image-tag)
      IMAGE_TAG="${2:-}"
      shift 2
      ;;
    --redis-tier)
      REDIS_TIER="${2:-}"
      shift 2
      ;;
    --redis-size-gb)
      REDIS_SIZE_GB="${2:-}"
      shift 2
      ;;
    --vpc-connector-range)
      VPC_CONNECTOR_RANGE="${2:-}"
      shift 2
      ;;
    --api-key)
      API_KEY_OVERRIDE="${2:-}"
      shift 2
      ;;
    --artifact-repo)
      ARTIFACT_REPO="${2:-}"
      shift 2
      ;;
    --custom-ca-cert-path)
      CUSTOM_CA_CERT_PATH="${2:-}"
      shift 2
      ;;
    --build-strategy)
      BUILD_STRATEGY="${2:-}"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "ERROR: Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$PROJECT_ID" ]]; then
  echo "ERROR: --project-id is required." >&2
  usage
  exit 1
fi

if [[ "$BUILD_STRATEGY" != "CloudBuild" && "$BUILD_STRATEGY" != "Docker" ]]; then
  echo "ERROR: --build-strategy must be CloudBuild or Docker." >&2
  exit 1
fi

ensure_gcloud
if [[ "$BUILD_STRATEGY" == "Docker" ]]; then
  ensure_docker
fi

if [[ -n "$CUSTOM_CA_CERT_PATH" ]]; then
  if [[ ! -f "$CUSTOM_CA_CERT_PATH" ]]; then
    echo "ERROR: Custom CA certificate file not found: $CUSTOM_CA_CERT_PATH" >&2
    exit 1
  fi
  run_gcloud config set core/custom_ca_certs_file "$CUSTOM_CA_CERT_PATH"
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOTENV_PATH="${SCRIPT_DIR}/../.env"
DEPLOY_API_KEY="$API_KEY_OVERRIDE"

if [[ -z "$DEPLOY_API_KEY" ]]; then
  api_key_from_dotenv="$(get_dotenv_value "$DOTENV_PATH" "API_KEY" || true)"
  if [[ -n "$api_key_from_dotenv" ]]; then
    DEPLOY_API_KEY="$api_key_from_dotenv"
    echo "Using API_KEY from $DOTENV_PATH"
  elif [[ -n "${API_KEY:-}" ]]; then
    DEPLOY_API_KEY="${API_KEY}"
    echo "Using API_KEY from environment variable API_KEY"
  else
    echo "WARNING: API_KEY not provided. Deploying without API key enforcement." >&2
  fi
fi

export GOOGLE_CLOUD_PROJECT="$PROJECT_ID"

run_gcloud config set project "$PROJECT_ID"
run_gcloud services enable run.googleapis.com artifactregistry.googleapis.com redis.googleapis.com vpcaccess.googleapis.com

if ! gcloud artifacts repositories describe "$ARTIFACT_REPO" --location="$REGION" >/dev/null 2>&1; then
  run_gcloud artifacts repositories create "$ARTIFACT_REPO" --repository-format=docker --location="$REGION" --description='Memcache API images'
fi

FULL_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REPO}/${SERVICE_NAME}:${IMAGE_TAG}"
need_docker_build=false

if [[ "$BUILD_STRATEGY" == "CloudBuild" ]]; then
  if ! build_output="$(gcloud builds submit --tag "$FULL_IMAGE" 2>&1)"; then
    printf '%s\n' "$build_output"
    if echo "$build_output" | grep -qi 'certificate verify failed'; then
      echo "WARNING: Cloud Build failed because of SSL verification. Switching to a local Docker build." >&2
      ensure_docker
      need_docker_build=true
    else
      echo "ERROR: gcloud builds submit failed." >&2
      exit 1
    fi
  else
    printf '%s\n' "$build_output"
  fi
fi

if [[ "$BUILD_STRATEGY" == "Docker" || "$need_docker_build" == "true" ]]; then
  run_gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet
  run_docker build -t "$FULL_IMAGE" .
  run_docker push "$FULL_IMAGE"
fi

redis_name="${SERVICE_NAME}-cache"
redis_host="$(get_redis_host "$redis_name" "$REGION")"

if [[ -z "$redis_host" ]]; then
  if ! gcloud redis instances describe "$redis_name" --region="$REGION" --format='value(name)' >/dev/null 2>&1; then
    run_gcloud redis instances create "$redis_name" --region="$REGION" --tier="$REDIS_TIER" --size="$REDIS_SIZE_GB" --network=default
  fi
fi

if [[ -z "$redis_host" ]]; then
  echo "WARNING: Redis host not available yet. Waiting for the instance to become ready." >&2
  for ((attempt = 1; attempt <= 10; attempt++)); do
    sleep 6
    redis_host="$(get_redis_host "$redis_name" "$REGION")"
    [[ -n "$redis_host" ]] && break
  done
fi

if [[ -z "$redis_host" ]]; then
  echo "ERROR: Redis host not available. Run: gcloud redis instances describe $redis_name --region=$REGION --format=value(host)" >&2
  exit 1
fi

redis_url="redis://${redis_host}:6379"
connector_name="${SERVICE_NAME}-connector"

if ! gcloud compute networks vpc-access connectors describe "$connector_name" --region="$REGION" >/dev/null 2>&1; then
  run_gcloud compute networks vpc-access connectors create "$connector_name" --region="$REGION" --network=default --range="$VPC_CONNECTOR_RANGE"
fi

env_vars="REDIS_URL=$redis_url"
if [[ -n "$DEPLOY_API_KEY" ]]; then
  env_vars="${env_vars},API_KEY=$DEPLOY_API_KEY"
fi

run_gcloud run deploy "$SERVICE_NAME" --image "$FULL_IMAGE" --region "$REGION" --allow-unauthenticated --vpc-connector "$connector_name" --set-env-vars "$env_vars"
