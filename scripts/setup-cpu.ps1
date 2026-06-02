param(
  [string]$Python = "",
  [switch]$SkipTorch,
  [switch]$SkipNodeInstall
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$VenvDir = Join-Path $Root ".venv-cpu"
$VenvPython = Join-Path $VenvDir "Scripts\python.exe"

function Invoke-BasePython {
  param([string[]]$ExtraArgs)
  $allArgs = @()
  $allArgs += $script:BasePythonArgs
  $allArgs += $ExtraArgs
  & $script:BasePythonExe @allArgs
}

function Set-BasePythonCommand {
  if ($Python) {
    $script:BasePythonExe = $Python
    $script:BasePythonArgs = @()
    return
  }

  $candidates = @(
    @("py", "-3.10"),
    @("py", "-3.11"),
    @("py", "-3.12"),
    @("py", "-3"),
    @("python")
  )

  foreach ($candidate in $candidates) {
    $exe = $candidate[0]
    if (-not (Get-Command $exe -ErrorAction SilentlyContinue)) {
      continue
    }
    $script:BasePythonExe = $exe
    $script:BasePythonArgs = @()
    if ($candidate.Count -gt 1) {
      $script:BasePythonArgs = $candidate[1..($candidate.Count - 1)]
    }
    try {
      Invoke-BasePython @("-c", "import sys; print(sys.executable)")
      if ($LASTEXITCODE -eq 0) {
        return
      }
    } catch {
    }
  }

  throw "Python was not found. Install Python 3.10/3.11/3.12, or pass -Python C:\Path\To\python.exe."
}

function Invoke-VenvPython {
  param([string[]]$ExtraArgs)
  & $VenvPython @ExtraArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Python command failed: $($ExtraArgs -join ' ')"
  }
}

Set-Location $Root
Set-BasePythonCommand

if (-not (Test-Path $VenvPython)) {
  Write-Host "Creating CPU virtual environment: $VenvDir"
  Invoke-BasePython @("-m", "venv", $VenvDir)
  if ($LASTEXITCODE -ne 0) {
    throw "Could not create CPU virtual environment."
  }
}

Invoke-VenvPython @("-m", "pip", "install", "--upgrade", "pip", "setuptools", "wheel")

if (-not $SkipTorch) {
  Write-Host "Installing CPU PyTorch"
  Invoke-VenvPython @("-m", "pip", "install", "torch", "torchvision", "torchaudio", "--index-url", "https://download.pytorch.org/whl/cpu")
}

Invoke-VenvPython @("-m", "pip", "install", "-r", (Join-Path $Root "requirements-gpu.txt"))

$assetDir = Join-Path $Root "3DDFA-V3\assets"
$requiredAssets = @(
  "face_model.npy",
  "large_base_net.pth",
  "net_recon.pth",
  "retinaface_resnet50_2020-07-20_old_torch.pth",
  "similarity_Lm3D_all.mat"
)
$missingAssets = @()
foreach ($asset in $requiredAssets) {
  if (-not (Test-Path (Join-Path $assetDir $asset))) {
    $missingAssets += $asset
  }
}
if ($missingAssets.Count -gt 0) {
  Write-Warning "3DDFA-V3 assets are missing: $($missingAssets -join ', '). CPU mode will still run and fall back to frontend OBJ/mock when needed."
}

if (-not $SkipNodeInstall -and -not (Test-Path (Join-Path $Root "node_modules"))) {
  $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if (-not $npm) {
    $npm = Get-Command npm -ErrorAction SilentlyContinue
  }
  if (-not $npm) {
    throw "npm was not found. Install Node.js or run npm install manually."
  }
  & $npm.Source install
  if ($LASTEXITCODE -ne 0) {
    throw "npm install failed."
  }
}

Write-Host ""
Write-Host "CPU setup is ready."
Write-Host "Start the app with: npm run dev:cpu"
