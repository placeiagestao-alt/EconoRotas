param(
  [string]$ServerHost = "econorotas.duckdns.org",
  [string]$User = "root",
  [string]$KeyPath = "$env:USERPROFILE\.ssh\econorotas_deploy",
  [string]$Domain = "econorotas.duckdns.org",
  [string]$LetsEncryptEmail = "admin@econorotas.com",
  [string]$RootDir = "/opt/econorota-osrm",
  [switch]$SkipMapPrepare
)

$ErrorActionPreference = "Stop"

trap {
  Write-Output "ERRO: $($_.Exception.Message)"
  exit 1
}

function Test-TcpPort {
  param(
    [string]$TargetHost,
    [int]$Port,
    [int]$TimeoutMs = 3000
  )

  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    $asyncResult = $client.BeginConnect($TargetHost, $Port, $null, $null)
    $ready = $asyncResult.AsyncWaitHandle.WaitOne($TimeoutMs, $false)
    if (!$ready) {
      return $false
    }

    $client.EndConnect($asyncResult)
    return $client.Connected
  } catch {
    return $false
  } finally {
    $client.Close()
  }
}

function Assert-RemoteValue {
  param(
    [string]$Name,
    [string]$Value
  )

  if ([string]::IsNullOrWhiteSpace($Value)) {
    throw "$Name nao pode ficar vazio."
  }

  if ($Value.Contains("'") -or $Value.Contains("`n") -or $Value.Contains("`r")) {
    throw "$Name contem caractere inseguro para comando remoto."
  }
}

function Invoke-Checked {
  param(
    [string]$Exe,
    [string[]]$Arguments
  )

  & $Exe @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Exe falhou com codigo $LASTEXITCODE."
  }
}

Assert-RemoteValue -Name "ServerHost" -Value $ServerHost
Assert-RemoteValue -Name "User" -Value $User
Assert-RemoteValue -Name "Domain" -Value $Domain
Assert-RemoteValue -Name "LetsEncryptEmail" -Value $LetsEncryptEmail
Assert-RemoteValue -Name "RootDir" -Value $RootDir

$projectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$osrmSourceDir = Join-Path $projectRoot "infra\osrm"
$requiredFiles = @(
  "docker-compose.yml",
  "install-ubuntu.sh",
  "osrm-health.sh",
  "prepare-brazil-map.sh",
  "README.md"
)

if (!(Test-Path -LiteralPath $KeyPath)) {
  throw "Chave SSH nao encontrada: $KeyPath"
}

foreach ($file in $requiredFiles) {
  $path = Join-Path $osrmSourceDir $file
  if (!(Test-Path -LiteralPath $path)) {
    throw "Arquivo OSRM nao encontrado: $path"
  }
}

if (!(Test-TcpPort -TargetHost $ServerHost -Port 22 -TimeoutMs 5000)) {
  throw "Porta 22 fechada em $ServerHost. Libere SSH antes de instalar OSRM."
}

$remoteTarget = "$User@$ServerHost"
$remoteTmp = "/tmp/econorota-osrm-setup"
$sshOptions = @(
  "-i", $KeyPath,
  "-o", "BatchMode=yes",
  "-o", "ConnectTimeout=15",
  "-o", "StrictHostKeyChecking=accept-new"
)
$sshBase = @($sshOptions + @($remoteTarget))
$scpBase = @($sshOptions)
$sudo = if ($User -eq "root") { "" } else { "sudo " }

Write-Output "Preparando diretorio remoto $remoteTmp em $remoteTarget..."
Invoke-Checked -Exe "ssh" -Arguments ($sshBase + @("mkdir -p '$remoteTmp'"))

foreach ($file in $requiredFiles) {
  $localPath = Join-Path $osrmSourceDir $file
  Write-Output "Enviando $file..."
  Invoke-Checked -Exe "scp" -Arguments ($scpBase + @($localPath, "${remoteTarget}:$remoteTmp/"))
}

Write-Output "Instalando Docker, Nginx, Certbot e servico OSRM..."
$installCommand = "cd '$remoteTmp' && ${sudo}env OSRM_DOMAIN='$Domain' LETSENCRYPT_EMAIL='$LetsEncryptEmail' OSRM_ROOT_DIR='$RootDir' bash install-ubuntu.sh"
Invoke-Checked -Exe "ssh" -Arguments ($sshBase + @($installCommand))

if (!$SkipMapPrepare) {
  Write-Output "Baixando e processando mapa do Brasil. Esta etapa pode demorar bastante."
  $prepareCommand = "${sudo}env OSRM_ROOT_DIR='$RootDir' bash '$RootDir/prepare-brazil-map.sh'"
  Invoke-Checked -Exe "ssh" -Arguments ($sshBase + @($prepareCommand))
}

Write-Output "Validando OSRM remoto..."
$healthCommand = "env OSRM_BASE_URL='https://$Domain' bash '$RootDir/osrm-health.sh'"
Invoke-Checked -Exe "ssh" -Arguments ($sshBase + @($healthCommand))

Write-Output "OSRM instalado e validado em https://$Domain."
Write-Output "Proximo passo: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\activate-osrm-vercel.ps1 -EndpointBaseUrl https://$Domain"
