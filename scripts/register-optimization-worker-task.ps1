$ErrorActionPreference = "Stop"

$taskBaseName = "EconoRotasOptimizationWorker"
$projectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$runner = Join-Path $projectRoot "scripts\run-optimization-worker-supervised.ps1"

if (!(Test-Path -LiteralPath (Join-Path $projectRoot ".env.worker.production"))) {
  throw ".env.worker.production nao encontrado em $projectRoot"
}

$trigger = New-ScheduledTaskTrigger -AtLogOn
$startupTrigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -MultipleInstances IgnoreNew

foreach ($index in 1..2) {
  $taskName = "$taskBaseName$index"
  $action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$runner`" -Instance $index" `
    -WorkingDirectory $projectRoot

  Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger @($trigger, $startupTrigger) `
    -Settings $settings `
    -Description "Mantem uma instancia BullMQ de otimizacao do EconoRotas em execucao." `
    -Force | Out-Null

  Start-ScheduledTask -TaskName $taskName
  Write-Output "Task registrada e iniciada: $taskName"
}

$watchdogTaskName = "$taskBaseName" + "Watchdog"
$watchdog = Join-Path $projectRoot "scripts\watch-optimization-worker.ps1"
$watchdogAction = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$watchdog`"" `
  -WorkingDirectory $projectRoot
$watchdogTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
  -RepetitionInterval (New-TimeSpan -Minutes 5) `
  -RepetitionDuration (New-TimeSpan -Days 3650)

Register-ScheduledTask `
  -TaskName $watchdogTaskName `
  -Action $watchdogAction `
  -Trigger $watchdogTrigger `
  -Settings $settings `
  -Description "Valida a saude dos workers BullMQ do EconoRotas e reinicia as tasks quando necessario." `
  -Force | Out-Null

Start-ScheduledTask -TaskName $watchdogTaskName
Write-Output "Task registrada e iniciada: $watchdogTaskName"
