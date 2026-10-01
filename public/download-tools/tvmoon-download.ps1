param(
    [string]$QueueFile,
    [string]$OutputDirectory = (Join-Path $PSScriptRoot 'Downloads'),
    [string]$Downloader
)
$ErrorActionPreference = 'Stop'

if (-not $QueueFile) {
    Add-Type -AssemblyName System.Windows.Forms
    $picker = New-Object System.Windows.Forms.OpenFileDialog
    $picker.Filter = 'TVmoon queue (*.json)|*.json'
    if ($picker.ShowDialog() -ne 'OK') { exit 0 }
    $QueueFile = $picker.FileName
}
$queue = Get-Content -LiteralPath $QueueFile -Raw -Encoding UTF8 | ConvertFrom-Json
if ($queue.version -ne 1 -or $queue.parallel -notin @(1, 2, 3) -or $queue.fragments -notin @(1, 2, 4, 8)) {
    throw 'Invalid queue settings. Export a new queue from TVmoon.'
}
$items = @($queue.items)
if ($items.Count -lt 1 -or $items.Count -gt 500) { throw 'Queue must contain 1-500 items.' }
$seen = @{}
foreach ($item in $items) {
    $uri = $null
    if ($item.id -isnot [string] -or $item.id.Length -gt 500 -or $seen.ContainsKey($item.id) -or
        $item.title -isnot [string] -or $item.title.Length -gt 200 -or
        $item.episode -isnot [int] -or $item.episode -lt 1 -or
        $item.url -isnot [string] -or $item.url.Length -gt 16384 -or
        -not [Uri]::TryCreate($item.url, [UriKind]::Absolute, [ref]$uri) -or
        $uri.Scheme -notin @('http', 'https') -or $uri.UserInfo) {
        throw 'Invalid queue item. Export a new queue from TVmoon.'
    }
    $seen[$item.id] = $true
}
if (-not $Downloader) {
    $localTool = Join-Path $PSScriptRoot 'yt-dlp.exe'
    if (Test-Path -LiteralPath $localTool) { $Downloader = $localTool }
    else { $Downloader = (Get-Command yt-dlp.exe -ErrorAction SilentlyContinue).Source }
}
if (-not $Downloader -or -not (Test-Path -LiteralPath $Downloader)) { throw 'yt-dlp.exe is missing. See README.txt for first-time setup.' }
$Downloader = (Resolve-Path -LiteralPath $Downloader).Path
$ffmpeg = Join-Path $PSScriptRoot 'ffmpeg.exe'
if (-not (Test-Path -LiteralPath $ffmpeg)) { $ffmpeg = (Get-Command ffmpeg.exe -ErrorAction SilentlyContinue).Source }
if (-not $ffmpeg) { throw 'ffmpeg.exe is missing. See README.txt for first-time setup.' }
$aria2 = Join-Path $PSScriptRoot 'aria2c.exe'
if (-not (Test-Path -LiteralPath $aria2)) { $aria2 = (Get-Command aria2c.exe -ErrorAction SilentlyContinue).Source }
$OutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$runId = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$reportPath = Join-Path $OutputDirectory "report-$runId.json"
$jobs = @()
$results = @()
$next = 0
Write-Host "Saving to $OutputDirectory"
Write-Host "Keep this window open. Parallel videos: $($queue.parallel); connections: $($queue.fragments)."
try {
    while ($next -lt $items.Count -or $jobs.Count -gt 0) {
        while ($next -lt $items.Count -and $jobs.Count -lt $queue.parallel) {
            $item = $items[$next]
            $next++
            $job = Start-Job -ArgumentList $Downloader, $ffmpeg, $aria2, $OutputDirectory, $queue.fragments, $item -ScriptBlock {
                param($tool, $ffmpegPath, $aria2Path, $folder, $connections, $task)
                $ErrorActionPreference = 'Stop'
                $sha = [Security.Cryptography.SHA256]::Create()
                $hash = ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($task.id)))).Replace('-', '').Substring(0, 12)
                $sha.Dispose()
                $name = [regex]::Replace($task.title, '[<>:"/\\|?*%\x00-\x1f]', '_').Trim().TrimEnd('.')
                if ($name.Length -gt 80) { $name = $name.Substring(0, 80) }
                $baseName = "TVmoon-$name-E$($task.episode)-$hash"
                $logPath = Join-Path $folder "$baseName.log"
                $arguments = @('--ignore-config', '--no-playlist', '--no-overwrites', '--continue', '--abort-on-unavailable-fragments',
                    '--retries', '3', '--fragment-retries', '3', '--socket-timeout', '30',
                    '--concurrent-fragments', "$connections", '--ffmpeg-location', $ffmpegPath,
                    '--output', (Join-Path $folder "$baseName.%(ext)s"))
                if ($aria2Path) {
                    $arguments += @('--downloader', "http:$aria2Path", '--downloader-args', "aria2c:-x $connections -s $connections -k 1M")
                }
                try {
                    $arguments += @('--', $task.url)
                    # Native tools write progress/warnings to stderr even on success.
                    $ErrorActionPreference = 'Continue'
                    & $tool @arguments *> $logPath
                    $code = $LASTEXITCODE
                    $ErrorActionPreference = 'Stop'
                    [pscustomobject]@{ id = $task.id; title = $task.title; episode = $task.episode; state = $(if ($code -eq 0) { 'completed' } else { 'failed' }); log = $logPath }
                } catch {
                    $_ | Out-File -LiteralPath $logPath -Encoding UTF8 -Append
                    [pscustomobject]@{ id = $task.id; title = $task.title; episode = $task.episode; state = 'failed'; log = $logPath }
                }
            }
            $jobs += [pscustomobject]@{ Job = $job; Item = $item }
        }
        foreach ($entry in @($jobs)) {
            if ($entry.Job.State -in @('Completed', 'Failed', 'Stopped')) {
                $output = @(Receive-Job -Job $entry.Job -ErrorAction SilentlyContinue)
                $result = $output | Where-Object { $_.state -in @('completed', 'failed') } | Select-Object -Last 1
                if (-not $result) { $result = [pscustomobject]@{ id = $entry.Item.id; title = $entry.Item.title; episode = $entry.Item.episode; state = 'failed' } }
                $results += $result
                $results | Select-Object id, title, episode, state, log | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $reportPath -Encoding UTF8
                Write-Host "[$($results.Count)/$($items.Count)] $($result.state): $($result.title) E$($result.episode)"
                Remove-Job -Job $entry.Job
                $jobs = @($jobs | Where-Object { $_.Job.Id -ne $entry.Job.Id })
            }
        }
        if ($jobs.Count -gt 0) { Start-Sleep -Milliseconds 500 }
    }
} finally {
    foreach ($entry in $jobs) { Stop-Job -Job $entry.Job; Remove-Job -Job $entry.Job }
}
$failedIds = @($results | Where-Object state -eq 'failed' | ForEach-Object id)
if ($failedIds.Count -gt 0) {
    @{ version = 1; parallel = $queue.parallel; fragments = $queue.fragments; items = @($items | Where-Object { $_.id -in $failedIds }) } |
        ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $OutputDirectory "failed-$runId.json") -Encoding UTF8
}
Write-Host "Finished. Completed: $($items.Count - $failedIds.Count); failed: $($failedIds.Count). Report: $reportPath"
if ($failedIds.Count -gt 0) { exit 1 }
