param(
  [string]$ServerHost = "econorotas.duckdns.org",
  [string]$AppHealthUrl = "https://econo-rotas.vercel.app/api/health",
  [string]$KeyPath = "$env:USERPROFILE\.ssh\econorotas_deploy",
  [switch]$UpdateDuckDns,
  [switch]$Strict
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

function Read-EnvFile {
  param([string]$Path)

  $values = @{}
  if (!(Test-Path -LiteralPath $Path)) {
    return $values
  }

  foreach ($line in Get-Content -LiteralPath $Path) {
    if ($line -match '^\s*#' -or $line -notmatch '=') {
      continue
    }

    $parts = $line.Split("=", 2)
    $values[$parts[0].Trim()] = $parts[1].Trim()
  }

  return $values
}

$projectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$envValues = Read-EnvFile -Path (Join-Path $projectRoot ".env.production")
$publicIp = (Invoke-RestMethod -Uri "https://api.ipify.org" -TimeoutSec 15).Trim()

if ($UpdateDuckDns) {
  $duckDomain = $envValues["DUCKDNS_DOMAIN"]
  $duckToken = $envValues["DUCKDNS_TOKEN"]
  if ([string]::IsNullOrWhiteSpace($duckDomain) -or [string]::IsNullOrWhiteSpace($duckToken)) {
    throw "DUCKDNS_DOMAIN ou DUCKDNS_TOKEN ausente em .env.production."
  }

  $updateUrl = "https://www.duckdns.org/update?domains=$duckDomain&token=$duckToken&ip=$publicIp"
  $duckResponse = Invoke-RestMethod -Uri $updateUrl -TimeoutSec 20
  if ($duckResponse -ne "OK") {
    throw "DuckDNS respondeu $duckResponse."
  }
}

$dnsRecords = @()
try {
  $dnsRecords = Resolve-DnsName $ServerHost -ErrorAction Stop |
    Where-Object { $_.Type -in "A", "AAAA", "CNAME" } |
    Select-Object Name,Type,IPAddress,NameHost
} catch {
  $dnsRecords = @()
}

$dnsIps = @($dnsRecords | Where-Object { $_.IPAddress } | ForEach-Object { $_.IPAddress })
$localAddresses = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -notlike "169.254*" -and $_.IPAddress -ne "127.0.0.1" } |
  Select-Object InterfaceAlias,IPAddress,PrefixLength)
$defaultRoute = Get-NetRoute -DestinationPrefix "0.0.0.0/0" -ErrorAction SilentlyContinue |
  Sort-Object RouteMetric |
  Select-Object -First 1 InterfaceAlias,NextHop,RouteMetric,InterfaceMetric

$ports = foreach ($port in 22,80,443,5000,3000) {
  [pscustomobject]@{
    port = $port
    open = Test-TcpPort -TargetHost $ServerHost -Port $port
  }
}

$localListeners = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $_.LocalPort -in 22,80,443,5000,3000 } |
  ForEach-Object {
    [pscustomobject]@{
      localAddress = $_.LocalAddress
      port = $_.LocalPort
      process = (Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue).ProcessName
    }
  })

$services = @(Get-Service sshd,ssh-agent,com.docker.service,LxssManager -ErrorAction SilentlyContinue |
  Select-Object Name,Status,StartType)

$upnpState = "unknown"
try {
  $upnp = New-Object -ComObject HNetCfg.NATUPnP
  if ($null -eq $upnp.StaticPortMappingCollection) {
    $upnpState = "unavailable"
  } else {
    $upnpState = "available"
  }
} catch {
  $upnpState = "unavailable"
}

$gatewayHttp = $null
if ($defaultRoute -and $defaultRoute.NextHop) {
  try {
    $gatewayResponse = Invoke-WebRequest -Uri "http://$($defaultRoute.NextHop)" -UseBasicParsing -TimeoutSec 8
    $gatewayContent = $gatewayResponse.Content
    $title = ""
    if ($gatewayContent -match "<title>(.*?)</title>") {
      $title = $matches[1]
    }

    $modelMatches = @([regex]::Matches($gatewayContent, "ZTE|ZXHN|F8040", "IgnoreCase") |
      ForEach-Object { $_.Value } |
      Select-Object -Unique)
    $requiresLogin = $gatewayContent -match "Frm_Username" -and $gatewayContent -match "Frm_Password"

    $gatewayHttp = [pscustomobject]@{
      url = "http://$($defaultRoute.NextHop)"
      statusCode = [int]$gatewayResponse.StatusCode
      title = $title
      detectedModelHints = $modelMatches
      requiresLogin = [bool]$requiresLogin
    }
  } catch {
    $gatewayHttp = [pscustomobject]@{
      url = "http://$($defaultRoute.NextHop)"
      reachable = $false
      error = $_.Exception.Message
    }
  }
}

$appHealth = $null
try {
  $health = Invoke-RestMethod -Uri $AppHealthUrl -TimeoutSec 20
  $appHealth = [pscustomobject]@{
    ok = [bool]$health.ok
    osrmBaseUrl = $health.osrm.baseUrl
    osrmRequired = [bool]$health.osrm.required
    osrmReachable = [bool]$health.osrm.reachable
    readiness = $health.operationalReadiness.status
  }
} catch {
  $appHealth = [pscustomobject]@{
    ok = $false
    error = $_.Exception.Message
  }
}

$sshReady = ($ports | Where-Object { $_.port -eq 22 }).open
$httpReady = ($ports | Where-Object { $_.port -eq 80 }).open
$httpsReady = ($ports | Where-Object { $_.port -eq 443 }).open

$blockers = @()
if ($dnsIps.Count -eq 0) {
  $blockers += "$ServerHost nao resolve DNS."
} elseif ($dnsIps -notcontains $publicIp) {
  $blockers += "$ServerHost resolve para $($dnsIps -join ', '), mas o IP publico atual e $publicIp."
}
if (!$sshReady) {
  $blockers += "Porta 22 fechada em $ServerHost; deploy por SSH nao inicia."
}
if (!$httpReady) {
  $blockers += "Porta 80 fechada em $ServerHost; Certbot HTTP-01 nao emite certificado."
}
if (!$httpsReady) {
  $blockers += "Porta 443 fechada em $ServerHost; Vercel nao tera endpoint OSRM HTTPS."
}
if ($gatewayHttp -and $gatewayHttp.requiresLogin -and $upnpState -ne "available") {
  $blockers += "Gateway $($defaultRoute.NextHop) exige login e UPnP esta indisponivel; redirecionamento 22/80/443 precisa ser feito no painel/admin do roteador."
}
if (!(Test-Path -LiteralPath $KeyPath)) {
  $blockers += "Chave SSH nao encontrada em $KeyPath."
}

$result = [pscustomobject]@{
  readyForOsrmDeploy = $blockers.Count -eq 0
  serverHost = $ServerHost
  publicIp = $publicIp
  dns = $dnsRecords
  localAddresses = $localAddresses
  defaultRoute = $defaultRoute
  upnp = $upnpState
  gatewayHttp = $gatewayHttp
  ports = $ports
  localListeners = $localListeners
  services = $services
  appHealth = $appHealth
  blockers = $blockers
}

$result | ConvertTo-Json -Depth 8

if ($Strict -and $blockers.Count -gt 0) {
  exit 1
}
