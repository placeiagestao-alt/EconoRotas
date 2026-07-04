param(
  [string]$TaskName = "EconoRotasDisasterRecoveryDaily",
  [string]$At = "03:15",
  [string]$BackupDir = "",
  [switch]$StartNow
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$runner = Join-Path $projectRoot "scripts\run-disaster-recovery-daily.ps1"

$requiredEnvFiles = @(".env.production", ".env.worker.production")
$hasEnv = $false
foreach ($envFile in $requiredEnvFiles) {
  if (Test-Path -LiteralPath (Join-Path $projectRoot $envFile)) {
    $hasEnv = $true
  }
}
if (-not $hasEnv) {
  throw "Arquivo de ambiente de producao nao encontrado em $projectRoot"
}

$parsedTime = [DateTime]::ParseExact($At, "HH:mm", $null)
$trigger = New-ScheduledTaskTrigger -Daily -At $parsedTime
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 15) `
  -MultipleInstances IgnoreNew

$runnerArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$runner`""
if ($BackupDir) {
  $runnerArgs = "$runnerArgs -BackupDir `"$BackupDir`""
}

$action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument $runnerArgs `
  -WorkingDirectory $projectRoot

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description "Executa backup logico e restore test diario do EconoRotas para manter evidencia dentro do RPO." `
  -Force | Out-Null

if ($StartNow) {
  Start-ScheduledTask -TaskName $TaskName
  Write-Output "Task registrada e iniciada: $TaskName"
} else {
  Write-Output "Task registrada: $TaskName"
}
