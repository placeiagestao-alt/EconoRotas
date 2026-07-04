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

$startedAt = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Add-Content -Path $logPath -Value "[$startedAt] starting daily disaster recovery drill"

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

& corepack @arguments *>> $logPath
$exitCode = $LASTEXITCODE

$finishedAt = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Add-Content -Path $logPath -Value "[$finishedAt] daily disaster recovery drill exited with code $exitCode"

if ($exitCode -ne 0) {
  exit $exitCode
}
