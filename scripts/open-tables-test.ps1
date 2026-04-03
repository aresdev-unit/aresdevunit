$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$webDir = Join-Path $repoRoot 'packages\web'
$candidatePorts = @(3000, 3001, 3002, 3003, 3004, 3005)
$startupTimeoutSeconds = 45

function Test-TablesPage {
  param(
    [int]$Port
  )

  try {
    $response = Invoke-WebRequest -Uri "http://localhost:$Port/tables" -UseBasicParsing -TimeoutSec 2
    if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400) {
      return $true
    }
  } catch {
    return $false
  }

  return $false
}

function Get-RunningTablesUrl {
  foreach ($port in $candidatePorts) {
    if (Test-TablesPage -Port $port) {
      return "http://localhost:$port/tables"
    }
  }

  return $null
}

$runningUrl = Get-RunningTablesUrl
if ($runningUrl) {
  Write-Host "Existing dev server found: $runningUrl"
  Start-Process $runningUrl | Out-Null
  exit 0
}

$devCommand = "Set-Location '$webDir'; npm.cmd run dev"
Start-Process powershell -ArgumentList @('-NoExit', '-Command', $devCommand) | Out-Null

$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
while ($stopwatch.Elapsed.TotalSeconds -lt $startupTimeoutSeconds) {
  Start-Sleep -Seconds 2
  $runningUrl = Get-RunningTablesUrl
  if ($runningUrl) {
    Write-Host "Opened: $runningUrl"
    Start-Process $runningUrl | Out-Null
    exit 0
  }
}

Write-Host 'Development server did not become ready in time.'
Write-Host "Open the new terminal window and check startup logs in: $webDir"
exit 1
