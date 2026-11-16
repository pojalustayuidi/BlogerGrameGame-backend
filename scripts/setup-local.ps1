$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
if (-not (Test-Path '.env')) {
    $content = Get-Content '.env.example' -Raw
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $key = -join ($bytes | ForEach-Object { $_.ToString('x2') })
    $content = $content.Replace('REPLACE_WITH_64_HEX_CHARS', $key)
    [System.IO.File]::WriteAllText((Join-Path (Get-Location) '.env'), $content)
    Write-Host 'Created .env with a random local admin key.'
} else {Write-Host '.env exists; it was not overwritten.'}
Write-Host 'Starting local PostgreSQL...'
docker compose up -d
if ($LASTEXITCODE -ne 0) { throw 'Docker Compose failed. Is Docker Desktop running?' }
Write-Host 'Installing npm packages...'
npm install
if ($LASTEXITCODE -ne 0) { throw 'npm install failed' }
Write-Host 'Running unit tests...'
npm test
if ($LASTEXITCODE -ne 0) { throw 'Unit tests failed' }
Write-Host 'Next: npm run dev'
