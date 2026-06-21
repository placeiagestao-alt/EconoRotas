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

function Get-ProcessTreeIds([int]$RootProcessId) {
  $allProcesses = Get-CimInstance Win32_Process
  $queue = New-Object System.Collections.Generic.Queue[int]
  $ids = New-Object System.Collections.Generic.List[int]
  $queue.Enqueue($RootProcessId)

  while ($queue.Count -gt 0) {
    $current = $queue.Dequeue()
    $ids.Add($current)

    $children = $allProcesses | Where-Object { $_.ParentProcessId -eq $current }
    foreach ($child in $children) {
      $queue.Enqueue([int]$child.ProcessId)
    }
  }

  return $ids
}

function Stop-WorkerProcessTree([int]$Instance) {
  $pattern = "run-optimization-worker-supervised.ps1"
  $instancePattern = "-Instance $Instance"
  $roots = Get-CimInstance Win32_Process |
    Where-Object {
      $_.CommandLine -and
      $_.CommandLine.Contains($pattern) -and
      $_.CommandLine.Contains($instancePattern)
    }

  foreach ($root in $roots) {
    $ids = @(Get-ProcessTreeIds -RootProcessId ([int]$root.ProcessId))
    [array]::Reverse($ids)
    foreach ($id in $ids) {
      Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
    }
    Write-WatchdogLog "stopped process tree instance=$Instance rootPid=$($root.ProcessId)"
  }
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

for ($index = 0; $index -lt $taskNames.Count; $index += 1) {
  $taskName = $taskNames[$index]
  $instance = $index + 1
  try {
    $task = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
    if ($task.State -eq "Running") {
      Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
      Start-Sleep -Seconds 2
    }
    Stop-WorkerProcessTree -Instance $instance
    Start-ScheduledTask -TaskName $taskName
    Write-WatchdogLog "started $taskName"
  } catch {
    Write-WatchdogLog "failed to restart ${taskName}: $($_.Exception.Message)"
  }
}
