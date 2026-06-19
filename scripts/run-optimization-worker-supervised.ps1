param(
  [string]$Instance = "local"
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$logDir = Join-Path $projectRoot "logs"
$instance = if ($Instance) { $Instance } elseif ($env:ECONOROTAS_WORKER_INSTANCE) { $env:ECONOROTAS_WORKER_INSTANCE } else { "local" }
$logPath = Join-Path $logDir "optimization-worker-$instance.log"

New-Item -ItemType Directory -Force -Path $logDir | Out-Null
Set-Location $projectRoot

$env:DOTENV_CONFIG_PATH = ".env.worker.production"
$env:NODE_OPTIONS = "--use-system-ca"

while ($true) {
  $startedAt = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Add-Content -Path $logPath -Value "[$startedAt] starting optimization worker instance=$instance"

  & corepack pnpm run worker:optimization *>> $logPath
  $exitCode = $LASTEXITCODE

  $finishedAt = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Add-Content -Path $logPath -Value "[$finishedAt] worker instance=$instance exited with code $exitCode; restarting in 15s"
  Start-Sleep -Seconds 15
}
