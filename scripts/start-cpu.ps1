param(
  [string]$HostAddress = "127.0.0.1",
  [int]$BackendPort = 8000,
  [int]$FrontendPort = 3000,
  [string]$GlbExporter = "auto",
  [string]$BlenderBin = "",
  [switch]$MockOnly
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$VenvPython = Join-Path $Root ".venv-cpu\Scripts\python.exe"

if (-not (Test-Path $VenvPython)) {
  throw "CPU virtual environment not found. Run npm run setup:cpu first."
}

$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npm) {
  $npm = Get-Command npm -ErrorAction SilentlyContinue
}
if (-not $npm) {
  throw "npm was not found. Install Node.js or run npm install manually."
}

Set-Location $Root

function Import-DotEnv {
  $envPath = Join-Path $Root ".env"
  if (-not (Test-Path $envPath)) {
    return
  }
  Get-Content -Path $envPath -Encoding UTF8 | ForEach-Object {
    $line = [string]$_
    $trimmed = $line.Trim()
    if ($trimmed -and -not $trimmed.StartsWith("#") -and $trimmed.Contains("=")) {
      $parts = $trimmed.Split("=", 2)
      $name = $parts[0].Trim()
      $value = $parts[1].Trim().Trim('"').Trim("'")
      if ($name) {
        [Environment]::SetEnvironmentVariable($name, $value, "Process")
      }
    }
  }
}

Import-DotEnv

$env:HQ_MASK_MODE = "real"
$env:HQ_MASK_FACE_PROVIDER = if ($MockOnly) { "mock" } else { "auto" }
$env:HQ_MASK_GLB_EXPORTER = $GlbExporter
$env:DDFA_V3_REPO_PATH = Join-Path $Root "3DDFA-V3"
$env:DDFA_V3_PYTHON = $VenvPython
$env:DDFA_V3_DEVICE = "cpu"
$env:DDFA_V3_DETECTOR = "retinaface"
$env:DDFA_V3_BACKBONE = "resnet50"
$env:HQ_MASK_MAX_ACTIVE_JOBS = "1"
$env:HQ_MASK_BACKEND_BASE_URL = "http://${HostAddress}:${BackendPort}"

if ($BlenderBin) {
  if (-not (Test-Path $BlenderBin)) {
    throw "BlenderBin was provided but does not exist: $BlenderBin"
  }
  $env:BLENDER_BIN = (Resolve-Path $BlenderBin).Path
} else {
  Remove-Item Env:\BLENDER_BIN -ErrorAction SilentlyContinue
}

Write-Host "Starting CPU backend on http://${HostAddress}:${BackendPort}"
Write-Host "Face provider: $env:HQ_MASK_FACE_PROVIDER"
Write-Host "3DDFA device: $env:DDFA_V3_DEVICE"
Write-Host "GLB exporter: $env:HQ_MASK_GLB_EXPORTER"
Write-Host "DeepSeek: $(if ($env:DEEPSEEK_API_KEY) { $env:DEEPSEEK_MODEL } else { 'not configured, using local RAG fallback' })"

$backendArgs = @(
  "-m", "uvicorn",
  "backend.app:app",
  "--host", $HostAddress,
  "--port", [string]$BackendPort
)
$backend = Start-Process `
  -FilePath $VenvPython `
  -ArgumentList $backendArgs `
  -WorkingDirectory $Root `
  -PassThru `
  -NoNewWindow

Start-Sleep -Seconds 2

Write-Host ""
Write-Host "Frontend: http://${HostAddress}:${FrontendPort}"
Write-Host "Backend health: http://${HostAddress}:${BackendPort}/api/hq-mask/health"
Write-Host "Press Ctrl+C to stop the frontend; the backend process will be stopped afterwards."
Write-Host ""

try {
  & $npm.Source run dev -- --host $HostAddress --port $FrontendPort
} finally {
  if ($backend -and -not $backend.HasExited) {
    Stop-Process -Id $backend.Id -Force
  }
}
