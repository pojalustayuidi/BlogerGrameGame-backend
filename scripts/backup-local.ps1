$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
if (-not (Test-Path '.env')) { throw 'Missing .env. Run setup-local.ps1 first.' }
$localEnv = @{}
Get-Content '.env' | ForEach-Object {
    if ($_ -match '^([A-Za-z_][A-Za-z_0-9]*)=(.*)$') { $localEnv[$matches[1]] = $matches[2] }
}
$user = $localEnv['POSTGRES_USER']
$database = $localEnv['POSTGRES_DB']
if (-not $user -or -not $database -or $user -notmatch '^[A-Za-z0-9_]+$' -or $database -notmatch '^[A-Za-z0-9_]+$') {
    throw 'Invalid POSTGRES_USER or POSTGRES_DB in .env'
}
New-Item -ItemType Directory -Path '.\backups' -Force | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$destination = ".\backups\pre-stage02-$stamp.dump"
$temporary = '/tmp/cipher-archive-stage02.dump'
Write-Host 'Creating a PostgreSQL custom-format backup inside the local container...'
docker compose exec -T postgres pg_dump -U $user -d $database -Fc -f $temporary
if ($LASTEXITCODE -ne 0) { throw 'pg_dump failed' }
Write-Host 'Copying backup out of Docker...'
docker compose cp "postgres:$temporary" $destination
if ($LASTEXITCODE -ne 0) { throw 'docker compose cp failed' }
docker compose exec -T postgres rm -f $temporary | Out-Null
if (-not (Test-Path $destination)) { throw 'Backup was not saved locally' }
Write-Host "Backup created: $destination"
Write-Host 'The backups folder is excluded from git. Keep this file private.'
