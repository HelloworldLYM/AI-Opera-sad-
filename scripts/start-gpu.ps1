param(
  [string]$Device = "cuda",
  [string]$HostAddress = "127.0.0.1",
  [int]$BackendPort = 8000,
  [int]$FrontendPort = 3000,
  [string]$GlbExporter = "auto",
  [string]$BlenderBin = ""
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$VenvPython = Join-Path $Root ".venv\Scripts\python.exe"

if (-not (Test-Path $VenvPython)) {
  throw "Virtual environment not found. Run scripts\setup-gpu.ps1 first."
}

$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npm) {
  $npm = Get-Command npm -ErrorAction SilentlyContinue
}
if (-not $npm) {
  throw "npm was not found. Install Node.js or run npm install manually."
}

function Find-BlenderExe {
  param([string]$Requested)

  if ($Requested) {
    if (Test-Path $Requested) {
      return (Resolve-Path $Requested).Path
    }
    throw "BlenderBin was provided but does not exist: $Requested"
  }

  $blenderCommand = Get-Command blender.exe -ErrorAction SilentlyContinue
  if (-not $blenderCommand) {
    $blenderCommand = Get-Command blender -ErrorAction SilentlyContinue
  }
  if ($blenderCommand) {
    return $blenderCommand.Source
  }

  $desktopCandidates = @(
    [Environment]::GetFolderPath("Desktop"),
    (Join-Path $HOME "Desktop"),
    (Split-Path -Parent $Root)
  ) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique

  $knownDirs = @(
    "Blender 5.1",
    "Blender5.1",
    "blender-5.1",
    "blender-5.1.0-windows-x64",
    "Blender 4.5.9",
    "Blender4.5.9",
    "blender-4.5.9",
    "blender-4.5.9-windows-x64",
    "Blender 4.5",
    "Blender4.5",
    "blender-4.5",
    "blender-4.5-windows-x64",
    "Blender",
    "blender"
  )

  $matches = @()
  $programRoots = @(
    (Join-Path $env:ProgramFiles "Blender Foundation"),
    (Join-Path ${env:ProgramFiles(x86)} "Blender Foundation")
  ) | Where-Object { $_ -and (Test-Path $_) }

  foreach ($programRoot in $programRoots) {
    foreach ($knownDir in $knownDirs) {
      $candidate = Join-Path (Join-Path $programRoot $knownDir) "blender.exe"
      if (Test-Path $candidate) {
        $matches += Get-Item $candidate
      }
    }
  }

  foreach ($desktop in $desktopCandidates) {
    $direct = Join-Path $desktop "blender.exe"
    if (Test-Path $direct) {
      $matches += Get-Item $direct
    }

    foreach ($knownDir in $knownDirs) {
      $candidate = Join-Path (Join-Path $desktop $knownDir) "blender.exe"
      if (Test-Path $candidate) {
        $matches += Get-Item $candidate
      }
    }

    $matches += Get-ChildItem -Path $desktop -Recurse -Filter blender.exe -File -ErrorAction SilentlyContinue |
      Where-Object { $_.FullName.Split([IO.Path]::DirectorySeparatorChar).Count -le ($desktop.Split([IO.Path]::DirectorySeparatorChar).Count + 5) }
  }

  $shortcutDirs = @(
    (Join-Path $env:APPDATA "Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar"),
    (Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs"),
    (Join-Path $env:ProgramData "Microsoft\Windows\Start Menu\Programs")
  ) + $desktopCandidates

  try {
    $shell = New-Object -ComObject WScript.Shell
    foreach ($shortcutDir in ($shortcutDirs | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique)) {
      Get-ChildItem -Path $shortcutDir -Recurse -Filter *.lnk -File -ErrorAction SilentlyContinue | ForEach-Object {
        try {
          $shortcut = $shell.CreateShortcut($_.FullName)
          $target = [string]$shortcut.TargetPath
          $label = "$($_.Name) $target $($shortcut.Arguments)"
          if ($label -match "blender" -and $target -and (Test-Path $target)) {
            $targetItem = Get-Item $target
            if ($targetItem.Name -ieq "blender.exe") {
              $matches += $targetItem
            }
          }
        } catch {
        }
      }
    }
  } catch {
  }

  $match = $matches |
    Sort-Object @{Expression = { if ($_.FullName -match "5\.1|51") { 0 } elseif ($_.FullName -match "4\.5\.9|459") { 1 } elseif ($_.FullName -match "4\.5|45") { 2 } else { 3 } }}, FullName |
    Select-Object -First 1

  if ($match) {
    return $match.FullName
  }
  return ""
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
$env:HQ_MASK_FACE_PROVIDER = "3ddfa-v3"
$env:HQ_MASK_GLB_EXPORTER = $GlbExporter
$env:DDFA_V3_REPO_PATH = Join-Path $Root "3DDFA-V3"
$env:DDFA_V3_PYTHON = $VenvPython
$env:DDFA_V3_DEVICE = $Device
$env:DDFA_V3_DETECTOR = "retinaface"
$env:DDFA_V3_BACKBONE = "resnet50"
$env:HQ_MASK_BACKEND_BASE_URL = "http://${HostAddress}:${BackendPort}"

$resolvedBlender = Find-BlenderExe -Requested $BlenderBin
if ($resolvedBlender) {
  $env:BLENDER_BIN = $resolvedBlender
  Write-Host "Blender: $resolvedBlender"
} else {
  Remove-Item Env:\BLENDER_BIN -ErrorAction SilentlyContinue
  Write-Host "Blender: not found yet. Auto mode will use Python/trimesh until blender.exe is on the Desktop or BLENDER_BIN is set."
}

Write-Host "Starting backend on http://${HostAddress}:${BackendPort}"
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
