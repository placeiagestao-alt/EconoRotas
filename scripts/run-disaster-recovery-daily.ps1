param(
  [string]$BackupDir = "",
  [switch]$NoRecordEvents
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$logDir = Join-Path $projectRoot "logs"
$logPath = Join-Path $logDir "disaster-recovery-daily.log"

New-Item -ItemType Directory -Force -Path $logDir | Out-Null
Set-Location $projectRoot

$env:NODE_OPTIONS = "--use-system-ca"

function Add-DrLog {
  param([string]$Message)

  Add-Content -Path $logPath -Value $Message -Encoding utf8
}

if (Test-Path -LiteralPath $logPath) {
  $sample = [System.IO.File]::ReadAllBytes($logPath) | Select-Object -First 4096
  if ($sample -contains 0) {
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    Move-Item -LiteralPath $logPath -Destination "$logPath.corrupt-$stamp.bak" -Force
  }
}

$startedAt = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Add-DrLog "[$startedAt] starting daily disaster recovery drill"

$arguments = @("pnpm", "run", "drill:disaster-recovery")
if ($BackupDir) {
  $arguments += "--"
  $arguments += "--backup-dir=$BackupDir"
}
if ($NoRecordEvents) {
  if (-not $BackupDir) {
    $arguments += "--"
  }
  $arguments += "--no-record-events"
}

$output = & corepack @arguments 2>&1
$exitCode = $LASTEXITCODE
foreach ($line in $output) {
  Add-DrLog ([string]$line)
}

$finishedAt = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Add-DrLog "[$finishedAt] daily disaster recovery drill exited with code $exitCode"

if ($exitCode -ne 0) {
  exit $exitCode
}
