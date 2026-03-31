param(
    [Parameter(ValueFromRemainingArguments=$true)]
    [string[]]$PassthroughArgs
)

Write-Warning 'scripts/deploy-cloudrun.ps1 is deprecated. Use scripts/deploy-google-cloudrun.ps1 instead.'
$targetScript = Join-Path $PSScriptRoot 'deploy-google-cloudrun.ps1'
& $targetScript @PassthroughArgs
exit $LASTEXITCODE
