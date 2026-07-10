param(
  [string]$EndpointBaseUrl = "https://econorotas.duckdns.org",
  [string]$AppHealthUrl = "https://econo-rotas.vercel.app/api/health",
  [switch]$SkipDeploy
)

$ErrorActionPreference = "Stop"

trap {
  Write-Output "ERRO: $($_.Exception.Message)"
  exit 1
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

function Set-VercelEnv {
  param(
    [string]$Name,
    [string]$Value
  )

  Write-Output "Configurando Vercel: $Name"
  Invoke-Checked -Exe "vercel" -Arguments @(
    "env",
    "add",
    $Name,
    "production",
    "--value",
    $Value,
    "--yes",
    "--force",
    "--no-sensitive",
    "--non-interactive"
  )
}

$projectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$vercelProjectPath = Join-Path $projectRoot ".vercel\project.json"

if (!(Test-Path -LiteralPath $vercelProjectPath)) {
  throw ".vercel\project.json nao encontrado. Rode este script dentro do projeto vinculado na Vercel."
}

$project = Get-Content -LiteralPath $vercelProjectPath | ConvertFrom-Json
$env:VERCEL_ORG_ID = $project.orgId
$env:VERCEL_PROJECT_ID = $project.projectId
if (($env:NODE_OPTIONS -split " ") -notcontains "--use-system-ca") {
  $env:NODE_OPTIONS = (($env:NODE_OPTIONS, "--use-system-ca") -join " ").Trim()
}

$baseUrl = $EndpointBaseUrl.TrimEnd("/")
$endpointUri = [Uri]$baseUrl
if ($endpointUri.Scheme -ne "https") {
  throw "OSRM de producao deve usar HTTPS."
}
if (
  $endpointUri.Host -eq "router.project-osrm.org" -or
  $endpointUri.Host.EndsWith(".project-osrm.org")
) {
  throw "router.project-osrm.org nao pode ser ativado como OSRM proprio."
}
$routeHealthUrl = "$baseUrl/route/v1/driving/-51.407,-22.121;-51.406,-22.122?overview=false&alternatives=false&steps=false"
$tableHealthUrl = "$baseUrl/table/v1/driving/-51.407,-22.121;-51.406,-22.122;-51.405,-22.123?annotations=duration,distance"

Write-Output "Validando endpoint OSRM antes de mexer na Vercel..."
try {
  $route = Invoke-RestMethod -Uri $routeHealthUrl -TimeoutSec 20
} catch {
  throw "Endpoint OSRM indisponivel em $routeHealthUrl. Vercel nao foi alterada. Detalhe: $($_.Exception.Message)"
}
if ($route.code -ne "Ok") {
  throw "OSRM route health retornou code=$($route.code)."
}

try {
  $table = Invoke-RestMethod -Uri $tableHealthUrl -TimeoutSec 20
} catch {
  throw "Endpoint OSRM table indisponivel em $tableHealthUrl. Vercel nao foi alterada. Detalhe: $($_.Exception.Message)"
}
if ($table.code -ne "Ok") {
  throw "OSRM table health retornou code=$($table.code)."
}

Set-VercelEnv -Name "OSRM_ENABLED" -Value "true"
Set-VercelEnv -Name "OSRM_BASE_URL" -Value $baseUrl
Set-VercelEnv -Name "OSRM_PROFILE" -Value "driving"
Set-VercelEnv -Name "OSRM_REQUEST_TIMEOUT_MS" -Value "8000"
Set-VercelEnv -Name "OSRM_HEALTH_TIMEOUT_MS" -Value "3000"
Set-VercelEnv -Name "OSRM_MAX_TABLE_NODES" -Value "100"
Set-VercelEnv -Name "OSRM_REQUIRED" -Value "true"

if (!$SkipDeploy) {
  Write-Output "Publicando novo deploy de producao para carregar variaveis OSRM..."
  Push-Location $projectRoot
  try {
    Invoke-Checked -Exe "vercel" -Arguments @("deploy", "--prod", "--yes", "--force")
  } finally {
    Pop-Location
  }

  Write-Output "Aguardando health de producao refletir OSRM proprio..."
  for ($attempt = 1; $attempt -le 18; $attempt++) {
    Start-Sleep -Seconds 10
    try {
      $health = Invoke-RestMethod -Uri $AppHealthUrl -TimeoutSec 20
      if (
        $health.osrm.required -eq $true -and
        $health.osrm.reachable -eq $true -and
        $health.osrm.productionReady -eq $true -and
        $health.osrm.providerType -eq "self_hosted" -and
        [string]$health.osrm.baseUrl -eq $baseUrl
      ) {
        Write-Output "Vercel pronta: OSRM proprio ativo em $baseUrl."
        exit 0
      }

      Write-Output "Tentativa ${attempt}: baseUrl=$($health.osrm.baseUrl), required=$($health.osrm.required), reachable=$($health.osrm.reachable)"
    } catch {
      Write-Output "Tentativa ${attempt}: health ainda indisponivel: $($_.Exception.Message)"
    }
  }

  throw "Deploy concluiu, mas /api/health nao confirmou OSRM proprio dentro do tempo esperado."
}

Write-Output "Variaveis OSRM configuradas. Rode um deploy de producao para ativar."
