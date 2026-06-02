param(
    [string]$InputText = "AI-Opera_voiceover_script.txt",
    [string]$Output = "AI-Opera_voiceover_120s.wav",
    [string]$Voice = "Microsoft Huihui Desktop",
    [int]$Rate = 0,
    [double]$TargetSeconds = 120
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Speech

function Find-Bytes {
    param(
        [byte[]]$Bytes,
        [byte[]]$Pattern,
        [int]$Start = 0
    )

    for ($i = $Start; $i -le $Bytes.Length - $Pattern.Length; $i++) {
        $matched = $true
        for ($j = 0; $j -lt $Pattern.Length; $j++) {
            if ($Bytes[$i + $j] -ne $Pattern[$j]) {
                $matched = $false
                break
            }
        }
        if ($matched) {
            return $i
        }
    }

    return -1
}

function Get-WavInfo {
    param([string]$Path)

    $bytes = [System.IO.File]::ReadAllBytes($Path)
    $fmtIndex = Find-Bytes -Bytes $bytes -Pattern ([System.Text.Encoding]::ASCII.GetBytes("fmt "))
    $dataIndex = Find-Bytes -Bytes $bytes -Pattern ([System.Text.Encoding]::ASCII.GetBytes("data"))

    if ($fmtIndex -lt 0 -or $dataIndex -lt 0) {
        throw "Could not parse WAV chunks."
    }

    $byteRate = [BitConverter]::ToInt32($bytes, $fmtIndex + 16)
    $blockAlign = [BitConverter]::ToInt16($bytes, $fmtIndex + 20)
    $dataSize = [BitConverter]::ToInt32($bytes, $dataIndex + 4)

    [pscustomobject]@{
        ByteRate = $byteRate
        BlockAlign = $blockAlign
        DataIndex = $dataIndex
        DataStart = $dataIndex + 8
        DataSize = $dataSize
        Duration = [Math]::Round($dataSize / $byteRate, 3)
    }
}

function Set-WavDuration {
    param(
        [string]$Path,
        [double]$Seconds
    )

    $bytes = [System.IO.File]::ReadAllBytes($Path)
    $info = Get-WavInfo -Path $Path
    $targetDataSize = [int]([Math]::Round(($Seconds * $info.ByteRate) / $info.BlockAlign) * $info.BlockAlign)
    $targetLength = $info.DataStart + $targetDataSize
    $newBytes = New-Object byte[] $targetLength

    [Array]::Copy($bytes, 0, $newBytes, 0, [Math]::Min($bytes.Length, $targetLength))
    [Array]::Copy([BitConverter]::GetBytes($targetDataSize), 0, $newBytes, $info.DataIndex + 4, 4)
    [Array]::Copy([BitConverter]::GetBytes($newBytes.Length - 8), 0, $newBytes, 4, 4)
    [System.IO.File]::WriteAllBytes($Path, $newBytes)
}

$inputPath = Resolve-Path -LiteralPath $InputText
$outputPath = Join-Path (Get-Location) $Output
$text = Get-Content -LiteralPath $inputPath -Raw -Encoding UTF8

$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SelectVoice($Voice)
$synth.Rate = $Rate

$format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo -ArgumentList 44100, ([System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen), ([System.Speech.AudioFormat.AudioChannel]::Mono)
$synth.SetOutputToWaveFile($outputPath, $format)
[void]$synth.Speak($text)
$synth.Dispose()

$before = Get-WavInfo -Path $outputPath
if ($TargetSeconds -gt 0) {
    Set-WavDuration -Path $outputPath -Seconds $TargetSeconds
}
$after = Get-WavInfo -Path $outputPath

[pscustomobject]@{
    Output = $outputPath
    Voice = $Voice
    Rate = $Rate
    SpeechDurationSeconds = $before.Duration
    FinalDurationSeconds = $after.Duration
}
