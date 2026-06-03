param(
    [Parameter(Mandatory=$true)] [string]$ProjectId,
    [string]$Region = 'europe-west4',
    [string]$ServiceName = 'memcache-api',
    [string]$ImageTag = 'latest',
    [string]$RedisTier = 'BASIC',
    [int]$RedisSizeGb = 1,
    [string]$VpcConnectorRange = '10.8.0.0/28',
    [string]$ApiKey,
    [string]$ApiKeySecondary,
    [string]$ArtifactRepo = 'memcache',
    [string]$CustomCaCertPath,
    [ValidateSet('CloudBuild', 'Docker')] [string]$BuildStrategy = 'CloudBuild'
)

function Get-DotEnvValue([string]$Path, [string]$Key) {
    if (-not (Test-Path -LiteralPath $Path)) {
        return $null
    }

    foreach ($line in Get-Content -LiteralPath $Path) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith('#')) {
            continue
        }
        $parts = $trimmed -split '=', 2
        if ($parts.Length -ne 2) {
            continue
        }
        if ($parts[0].Trim() -ne $Key) {
            continue
        }

        $value = $parts[1].Trim()
        if (
            ($value.StartsWith('"') -and $value.EndsWith('"')) -or
            ($value.StartsWith("'") -and $value.EndsWith("'"))
        ) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        return $value
    }

    return $null
}

function Ensure-Gcloud() {
    if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
        throw 'gcloud CLI not found. Install Google Cloud SDK first.'
    }
}

function Ensure-Docker() {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        throw 'Docker CLI not found. Install Docker Desktop/Engine and ensure it is running.'
    }
    & docker info --format '{{json .ServerVersion}}' >$null 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw 'Docker CLI is installed but cannot reach the Docker daemon. Start Docker Desktop/Engine (or ensure dockerd is running) and rerun the script.'
    }
}

function Run-Gcloud([string[]]$CommandArgs) {
    $display = $CommandArgs -join ' '
    Write-Host "Running: gcloud $display" -ForegroundColor Cyan
    gcloud @CommandArgs
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed: gcloud $display"
    }
}

function Invoke-GcloudWithCapture([string[]]$CommandArgs) {
    $display = $CommandArgs -join ' '
    Write-Host "Running: gcloud $display" -ForegroundColor Cyan
    $capturedOutput = @()
    try {
        $capturedOutput = & gcloud @CommandArgs 2>&1
    }
    catch {
        $capturedOutput += $_.ToString()
    }
    foreach ($line in $capturedOutput) {
        Write-Host $line
    }
    $exitCode = if ($null -ne $LASTEXITCODE) { $LASTEXITCODE } else { 1 }
    return [PSCustomObject]@{
        Output = $capturedOutput
        ExitCode = $exitCode
    }
}

function Get-RedisHost([string]$InstanceName, [string]$Region) {
    $output = & gcloud redis instances describe $InstanceName --region=$Region --format="value(host)" 2>$null
    if ($LASTEXITCODE -ne 0) {
        return $null
    }
    if ($null -eq $output) {
        return $null
    }
    $redisHost = ($output | Select-Object -First 1).ToString().Trim()
    if ([string]::IsNullOrWhiteSpace($redisHost)) {
        return $null
    }
    return $redisHost
}

function Test-RedisInstance([string]$InstanceName, [string]$Region) {
    $output = & gcloud redis instances describe $InstanceName --region=$Region --format="value(name)" 2>$null
    if ($LASTEXITCODE -ne 0) {
        return $false
    }
    if ($null -eq $output) {
        return $false
    }
    $name = ($output | Select-Object -First 1).ToString().Trim()
    return -not [string]::IsNullOrWhiteSpace($name)
}

function Run-Docker([string[]]$CommandArgs) {
    $display = $CommandArgs -join ' '
    Write-Host "Running: docker $display" -ForegroundColor Cyan
    docker @CommandArgs
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed: docker $display"
    }
}

Ensure-Gcloud
if ($BuildStrategy -eq 'Docker') {
    Ensure-Docker
}

$resolvedCustomCaPath = $null
if ($CustomCaCertPath) {
    try {
        $resolvedCustomCaPath = (Resolve-Path -LiteralPath $CustomCaCertPath -ErrorAction Stop).ProviderPath
    }
    catch {
        throw "Custom CA certificate file not found: $CustomCaCertPath"
    }
    Run-Gcloud @('config', 'set', 'core/custom_ca_certs_file', $resolvedCustomCaPath)
}

if ([string]::IsNullOrWhiteSpace($ApiKey)) {
    $dotEnvPath = Join-Path $PSScriptRoot '..\.env'
    $apiKeyFromDotEnv = Get-DotEnvValue -Path $dotEnvPath -Key 'API_KEY'
    if (-not [string]::IsNullOrWhiteSpace($apiKeyFromDotEnv)) {
        $ApiKey = $apiKeyFromDotEnv
        Write-Host "Using API_KEY from $dotEnvPath" -ForegroundColor DarkCyan
    }
    elseif (-not [string]::IsNullOrWhiteSpace($env:API_KEY)) {
        $ApiKey = $env:API_KEY
        Write-Host 'Using API_KEY from environment variable API_KEY' -ForegroundColor DarkCyan
    }
}

if ([string]::IsNullOrWhiteSpace($ApiKeySecondary)) {
    if (-not $dotEnvPath) {
        $dotEnvPath = Join-Path $PSScriptRoot '..\.env'
    }
    $apiKeySecondaryFromDotEnv = Get-DotEnvValue -Path $dotEnvPath -Key 'API_KEY_SECONDARY'
    if (-not [string]::IsNullOrWhiteSpace($apiKeySecondaryFromDotEnv)) {
        $ApiKeySecondary = $apiKeySecondaryFromDotEnv
        Write-Host "Using API_KEY_SECONDARY from $dotEnvPath" -ForegroundColor DarkCyan
    }
    elseif (-not [string]::IsNullOrWhiteSpace($env:API_KEY_SECONDARY)) {
        $ApiKeySecondary = $env:API_KEY_SECONDARY
        Write-Host 'Using API_KEY_SECONDARY from environment variable API_KEY_SECONDARY' -ForegroundColor DarkCyan
    }
}

if ([string]::IsNullOrWhiteSpace($ApiKey) -and [string]::IsNullOrWhiteSpace($ApiKeySecondary)) {
    Write-Warning 'API_KEY and API_KEY_SECONDARY not provided. Deploying without API key enforcement.'
}

$env:GOOGLE_CLOUD_PROJECT = $ProjectId

Run-Gcloud @('config', 'set', 'project', $ProjectId)
Run-Gcloud @('services', 'enable', 'run.googleapis.com', 'artifactregistry.googleapis.com', 'redis.googleapis.com', 'vpcaccess.googleapis.com')

# Create Artifact Registry repo if missing
$repoExists = gcloud artifacts repositories list --location=$Region --format="value(name)" | Select-String "$ArtifactRepo" -Quiet
if (-not $repoExists) {
Run-Gcloud @('artifacts', 'repositories', 'create', $ArtifactRepo, '--repository-format=docker', "--location=$Region", "--description=Memcache API images")
}

$fullImage="${Region}-docker.pkg.dev/${ProjectId}/${ArtifactRepo}/${ServiceName}:${ImageTag}"
$needDockerBuild = $false
if ($BuildStrategy -eq 'CloudBuild') {
    $buildResult = Invoke-GcloudWithCapture @('builds', 'submit', '--tag', $fullImage)
    if ($buildResult.ExitCode -ne 0) {
        $buildOutput = ($buildResult.Output -join "`n")
        if ($buildOutput -match 'CERTIFICATE_VERIFY_FAILED' -or $buildOutput -match 'certificate verify failed') {
            Write-Warning 'Cloud Build failed because of SSL verification. Switching to a local Docker build.'
            Ensure-Docker
            $needDockerBuild = $true
        }
        else {
            throw "Command failed: gcloud builds submit --tag $fullImage"
        }
    }
}
if ($BuildStrategy -eq 'Docker' -or $needDockerBuild) {
    Run-Gcloud @('auth', 'configure-docker', "${Region}-docker.pkg.dev", '--quiet')
    Run-Docker @('build', '-t', $fullImage, '.')
    Run-Docker @('push', $fullImage)
}

# Ensure Redis instance
$redisName="$ServiceName-cache"
$redisInfo = Get-RedisHost $redisName $Region
if (-not $redisInfo) {
    $redisExists = Test-RedisInstance $redisName $Region
    if (-not $redisExists) {
        Run-Gcloud @('redis', 'instances', 'create', $redisName, "--region=$Region", "--tier=$RedisTier", "--size=$RedisSizeGb", '--network=default')
    }
}
if (-not $redisInfo) {
    Write-Warning 'Redis host not available yet. Waiting for the instance to become ready.'
    for ($attempt = 1; $attempt -le 10 -and -not $redisInfo; $attempt++) {
        Start-Sleep -Seconds 6
        $redisInfo = Get-RedisHost $redisName $Region
    }
}
if (-not $redisInfo) {
    throw "Redis host not available. Run 'gcloud redis instances describe $redisName --region=$Region --format=value(host)' to verify."
}

$redisUrl = "redis://${redisInfo}:6379"

# Ensure VPC connector
$connectorName="${ServiceName}-connector"
$vpcExists = gcloud compute networks vpc-access connectors describe $connectorName --region=$Region 2>$null
if ($LASTEXITCODE -ne 0) {
    Run-Gcloud @('compute', 'networks', 'vpc-access', 'connectors', 'create', $connectorName, "--region=$Region", '--network=default', "--range=$VpcConnectorRange")
}

$envVars = "REDIS_URL=$redisUrl"
if ($ApiKey) {
    $envVars += ",API_KEY=$ApiKey"
}
if ($ApiKeySecondary) {
    $envVars += ",API_KEY_SECONDARY=$ApiKeySecondary"
}

Run-Gcloud @('run', 'deploy', $ServiceName, '--image', $fullImage, "--region=$Region", '--allow-unauthenticated', "--vpc-connector=$connectorName", "--set-env-vars=$envVars")
