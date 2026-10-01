$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$scratch = Join-Path ([IO.Path]::GetTempPath()) ('tvmoon-helper-test-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $scratch | Out-Null
$stub = Join-Path $scratch 'fake-downloader.ps1'
@'
$args | ConvertTo-Json | Write-Output
if ($args[-1] -like '*fail*') { $global:LASTEXITCODE = 1 } else { $global:LASTEXITCODE = 0 }
'@ | Set-Content -LiteralPath $stub -Encoding UTF8
New-Item -ItemType File -Path (Join-Path $scratch 'ffmpeg.exe') | Out-Null
$previousPath = $env:PATH
$env:PATH = "$scratch;$previousPath"
$queuePath = Join-Path $scratch 'queue.json'
$output = Join-Path $scratch 'output'
@{ version = 1; parallel = 2; fragments = 4; items = @(
    @{ id = 'one'; title = '../unsafe%title'; episode = 1; url = 'https://media.example/good.m3u8' },
    @{ id = 'two'; title = 'failure'; episode = 2; url = 'https://media.example/fail.m3u8' },
    @{ id = 'three'; title = 'final'; episode = 3; url = 'https://media.example/final.mp4' }
) } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $queuePath -Encoding UTF8
try {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repo 'public/download-tools/tvmoon-download.ps1') -QueueFile $queuePath -OutputDirectory $output -Downloader $stub
    if ($LASTEXITCODE -ne 1) { throw 'Expected a failed task exit code.' }
    $report = Get-Content -LiteralPath (Get-ChildItem -LiteralPath $output -Filter 'report-*.json').FullName -Raw | ConvertFrom-Json
    if (@($report | Where-Object state -eq 'completed').Count -ne 2 -or @($report | Where-Object state -eq 'failed').Count -ne 1) { throw 'Unexpected task states.' }
    $retry = Get-Content -LiteralPath (Get-ChildItem -LiteralPath $output -Filter 'failed-*.json').FullName -Raw | ConvertFrom-Json
    if ($retry.items.Count -ne 1 -or $retry.items[0].id -ne 'two') { throw 'Retry queue must contain failed tasks only.' }
    foreach ($log in Get-ChildItem -LiteralPath $output -Filter '*.log') {
        $arguments = Get-Content -LiteralPath $log.FullName -Raw | ConvertFrom-Json
        if ($arguments -notcontains '--ignore-config' -or $arguments -notcontains '--abort-on-unavailable-fragments' -or $arguments -notcontains '--concurrent-fragments') { throw 'Missing safe downloader arguments.' }
        if ($arguments[-2] -ne '--') { throw 'URL must follow the option terminator.' }
    }
    $invalid = @{ version = 1; parallel = 2; fragments = 4; items = @(@{ id = 'bad'; title = 'bad'; episode = 1; url = 'file:///C:/private' }) }
    $invalid | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $queuePath -Encoding UTF8
    $ErrorActionPreference = 'Continue'
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repo 'public/download-tools/tvmoon-download.ps1') -QueueFile $queuePath -OutputDirectory $output -Downloader $stub 2>$null
    $ErrorActionPreference = 'Stop'
    if ($LASTEXITCODE -eq 0) { throw 'Unsafe URL was accepted.' }
    Write-Host 'Windows helper integration checks passed.'
} finally {
    $env:PATH = $previousPath
    # Retain the small isolated fixture and reports for inspection; no downloaded media.
    Write-Host "Test artifacts: $scratch"
}
# The last child intentionally rejected an unsafe queue. Do not propagate its
# expected nonzero exit code to the GitHub Actions PowerShell wrapper.
$global:LASTEXITCODE = 0
