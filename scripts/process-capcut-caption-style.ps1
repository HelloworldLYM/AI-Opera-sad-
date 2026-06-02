param(
    [string]$Source = "capcut-transparent-subtitles.mp4",
    [string]$Output = "capcut-plain-front-subtitles.mp4"
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
$workDir = Join-Path $workspace ".codex-capcut\caption-style-$stamp"
$rawDir = Join-Path $workDir "segA-raw"
$processedDir = Join-Path $workDir "segA-processed"

New-Item -ItemType Directory -Path $rawDir, $processedDir -Force | Out-Null

$segA = Join-Path $workDir "segment-a.mp4"
$segB = Join-Path $workDir "segment-b.mp4"
$concatList = Join-Path $workDir "concat-list.txt"
$videoOnly = Join-Path $workDir "video-only.mp4"

function Invoke-Native {
    param([scriptblock]$Command)
    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw "Native command failed with exit code $LASTEXITCODE"
    }
}

Invoke-Native { & $ffmpeg -v error -y -i $inputPath -frames:v 726 -an (Join-Path $rawDir "frame_%06d.png") }

Invoke-Native { & $python "scripts\process_capcut_caption_style.py" --input $rawDir --output $processedDir --fps 30 }

Invoke-Native { & $ffmpeg -v error -y -framerate 30 -i (Join-Path $processedDir "frame_%06d.png") -an -c:v libx264 -pix_fmt yuv420p -profile:v high -level:v 3.1 -r 30 -b:v 1272k -video_track_timescale 15360 -movflags +faststart $segA }

Invoke-Native { & $ffmpeg -v error -y -ss 24.2 -i $inputPath -map 0:v:0 -an -c:v copy $segB }

Set-Content -LiteralPath $concatList -Value @("file 'segment-a.mp4'", "file 'segment-b.mp4'") -Encoding ASCII

Invoke-Native { & $ffmpeg -v error -y -f concat -safe 0 -i $concatList -c copy $videoOnly }

Invoke-Native { & $ffmpeg -v error -y -i $videoOnly -i $inputPath -map 0:v:0 -map 1:a:0 -c:v copy -c:a copy -movflags +faststart -shortest $outputPath }

Invoke-Native { & $ffprobe -v error -show_entries format=duration,size,bit_rate:stream=index,codec_type,codec_name,width,height,pix_fmt,r_frame_rate,avg_frame_rate,time_base,bit_rate,sample_rate,channels -of json $outputPath }
