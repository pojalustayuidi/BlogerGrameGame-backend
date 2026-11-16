$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
$base = 'http://127.0.0.1:8085'
$envFile = Get-Content '.env'
$line = $envFile | Where-Object { $_ -match '^ADMIN_API_KEY=' } | Select-Object -First 1
if (-not $line) { throw 'Missing admin key in .env' }
$adminKey = ($line -split '=', 2)[1].Trim()
Write-Host 'Checking health...'
Invoke-RestMethod "$base/health" | ConvertTo-Json
$headers = @{ 'X-Admin-Key' = $adminKey }
Write-Host 'Creating local test player...'
$player = Invoke-RestMethod "$base/api/v1/admin/test-players" -Method POST -Headers $headers -ContentType 'application/json' -Body '{}'
$id = $player.player.id
$reqId = [guid]::NewGuid().ToString()
$body = @{ amount = 500; reason = 'Manual local smoke test'; requestId = $reqId } | ConvertTo-Json
Write-Host 'Granting 500 coins...'
Invoke-RestMethod "$base/api/v1/admin/players/$id/grant-coins" -Method POST -Headers $headers -Body $body -ContentType 'application/json' | ConvertTo-Json
Write-Host 'Retrying same requestId (should NOT grant again)...'
Invoke-RestMethod "$base/api/v1/admin/players/$id/grant-coins" -Method POST -Headers $headers -Body $body -ContentType 'application/json' | ConvertTo-Json
Write-Host 'Fetching player...'
Invoke-RestMethod "$base/api/v1/admin/players/$id" -Headers $headers | ConvertTo-Json
Write-Host "Done. Test player ID: $id"
