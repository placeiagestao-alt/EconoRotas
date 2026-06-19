$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$logDir = Join-Path $projectRoot "logs"
$logPath = Join-Path $logDir "optimization-worker-watchdog.log"
$healthUrl = "https://econo-rotas.vercel.app/api/health"
$taskNames = @("EconoRotasOptimizationWorker1", "EconoRotasOptimizationWorker2")

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Write-WatchdogLog([string]$Message) {
  $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Add-Content -Path $logPath -Value "[$timestamp] $Message"
}

try {
  $response = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 25
  $health = $response.Content | ConvertFrom-Json
  $workerCount = 0
  $minimumWorkerCount = 2
  if ($health.queue -and $null -ne $health.queue.workerCount) {
    $workerCount = [int]$health.queue.workerCount
  }
  if ($health.queue -and $null -ne $health.queue.minimumWorkerCount) {
    $minimumWorkerCount = [int]$health.queue.minimumWorkerCount
  }

  if ($workerCount -ge $minimumWorkerCount) {
    Write-WatchdogLog "healthy workerCount=$workerCount minimumWorkerCount=$minimumWorkerCount"
    return
  }

  Write-WatchdogLog "under replicated workerCount=$workerCount minimumWorkerCount=$minimumWorkerCount; restarting tasks"
} catch {
  Write-WatchdogLog "health check failed: $($_.Exception.Message); restarting tasks"
}

foreach ($taskName in $taskNames) {
  try {
    $task = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
    if ($task.State -eq "Running") {
      Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
      Start-Sleep -Seconds 2
    }
    Start-ScheduledTask -TaskName $taskName
    Write-WatchdogLog "started $taskName"
  } catch {
    Write-WatchdogLog "failed to restart ${taskName}: $($_.Exception.Message)"
  }
}
