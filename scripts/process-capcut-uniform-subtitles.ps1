param(
    [string]$Source = "capcut-transparent-subtitles.mp4",
    [string]$Output = "capcut-uniform-small-subtitles.mp4",
    [string]$VideoBitrate = "1318k",
    [int]$Width = 1280,
    [int]$Height = 720,
    [int]$Timescale = 15360,
    [string]$Level = "3.1",
    [string]$Preset = "medium"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$workspace = (Get-Location).Path
$ffmpegRoot = Join-Path $workspace "remotion-tech-route\node_modules\@remotion\compositor-win32-x64-msvc\ffmpeg\remotion"
$ffmpeg = Join-Path $ffmpegRoot "bin\ffmpeg.exe"
$ffprobe = Join-Path $ffmpegRoot "bin\ffprobe.exe"
$python = "C:\Users\20360\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"

$env:PATH = (Join-Path $ffmpegRoot "lib") + ";" + $env:PATH

$inputPath = Resolve-Path -LiteralPath $Source
$outputPath = Join-Path $workspace $Output
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$workDir = Join-Path $workspace ".codex-capcut\uniform-subtitles-$stamp"
$videoOnly = Join-Path $workDir "video-only.mp4"

New-Item -ItemType Directory -Path $workDir -Force | Out-Null

function Invoke-Native {
    param([scriptblock]$Command)
    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw "Native command failed with exit code $LASTEXITCODE"
    }
}

Invoke-Native { & $python "scripts\render_capcut_uniform_subtitles.py" --input $inputPath --output $videoOnly --ffmpeg $ffmpeg --width $Width --height $Height --fps 30 --bitrate $VideoBitrate --timescale $Timescale --level $Level --preset $Preset }

Invoke-Native { & $ffmpeg -v error -y -i $videoOnly -i $inputPath -map 0:v:0 -map 1:a:0 -c:v copy -c:a copy -movflags +faststart -shortest $outputPath }

Invoke-Native { & $ffprobe -v error -show_entries format=duration,size,bit_rate:stream=index,codec_type,codec_name,width,height,pix_fmt,r_frame_rate,avg_frame_rate,time_base,bit_rate,sample_rate,channels -of json $outputPath }
