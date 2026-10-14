param(
    [string]$ProjectDirectory = 'C:\UPminimart',
    [string]$DatabasePath = '',
    [int]$IntervalSeconds = 300,
    [switch]$Once,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($DatabasePath)) {
    $settingPath = 'C:\iSoft SaleStore\Setting.txt'
    $DatabasePath = if (Test-Path -LiteralPath $settingPath) {
        (Get-Content -LiteralPath $settingPath -Raw -Encoding Default).Trim()
    } else {
        'C:\Users\pos\Documents\database.mdb'
    }
}
$syncRoot = Join-Path $ProjectDirectory 'legacy-sync'
$runsRoot = Join-Path $syncRoot 'runs'
$statePath = Join-Path $syncRoot 'agent-state.json'
$logPath = Join-Path $syncRoot 'legacy-sync-agent.log'
$errorLogPath = Join-Path $syncRoot 'legacy-sync-agent-error.log'
$exportScript = Join-Path $ProjectDirectory 'scripts\export-legacy-data.ps1'
$progressPath = Join-Path $syncRoot 'progress.json'
. (Join-Path $PSScriptRoot 'legacy-sync-progress.ps1')
$powerShell32 = "$env:WINDIR\SysWOW64\WindowsPowerShell\v1.0\powershell.exe"
$mutex = New-Object Threading.Mutex($false, 'Local\UPMinimartLegacySyncAgent')

New-Item -ItemType Directory -Force -Path $runsRoot | Out-Null

function Write-AgentLog([string]$Message, [switch]$ErrorLog) {
    $line = "{0} {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
    Add-Content -LiteralPath $(if ($ErrorLog) { $errorLogPath } else { $logPath }) -Value $line -Encoding UTF8
}

function Read-State {
    if (-not (Test-Path -LiteralPath $statePath)) { return $null }
    try { Get-Content -LiteralPath $statePath -Raw -Encoding UTF8 | ConvertFrom-Json } catch { $null }
}

function Write-State($Source, [string]$Status, [string]$Message) {
    [ordered]@{
        sourcePath = $Source.FullName
        sourceSize = $Source.Length
        sourceMtimeUtc = $Source.LastWriteTimeUtc.ToString('o')
        checkedAt = [DateTime]::UtcNow.ToString('o')
        status = $Status
        message = $Message
    } | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8
}

function Invoke-Sync {
    if (-not (Test-Path -LiteralPath $DatabasePath)) { throw "Legacy database is unavailable: $DatabasePath (check the network share and Windows credentials)" }
    if (-not (Test-Path -LiteralPath $powerShell32)) { throw "32-bit Windows PowerShell is required to read the MDB file" }
    $source = Get-Item -LiteralPath $DatabasePath
    $state = Read-State
    $sameFile = $state -and $state.status -in @('completed','unchanged') -and [long]$state.sourceSize -eq $source.Length -and $state.sourceMtimeUtc -eq $source.LastWriteTimeUtc.ToString('o')
    if ($sameFile -and -not $Force) {
        Write-State $source 'unchanged' 'MDB file has not changed'
        return
    }

    $runName = Get-Date -Format 'yyyyMMdd_HHmmss'
    $runDirectory = Join-Path $runsRoot $runName
    New-Item -ItemType Directory -Force -Path $runDirectory | Out-Null
    Write-AgentLog "Reading $($source.FullName), $($source.Length) bytes"
    $startedAt = [DateTime]::UtcNow.ToString('o')
    Write-LegacyProgress -Path $progressPath -SourcePath $source.FullName -Status 'processing' -Phase 'prepare' -Label 'กำลังเตรียมอ่านไฟล์ MDB' -Percent 0 -StartedAt $startedAt
    try {
        & $powerShell32 -NoProfile -ExecutionPolicy Bypass -File $exportScript -DatabasePath $DatabasePath -OutputDirectory $runDirectory -SyncMode -ProgressPath $progressPath -StartedAt $startedAt
        if ($LASTEXITCODE -ne 0) { throw "MDB export failed (exit $LASTEXITCODE)" }
        $containerDirectory = "/legacy-sync/runs/$runName"
        Push-Location $ProjectDirectory
        try {
            & docker compose exec -T -e "LEGACY_EXPORT_DIR=$containerDirectory" -e 'LEGACY_BASELINE_DIR=/app/legacy-export' -e 'LEGACY_PROGRESS_PATH=/legacy-sync/progress.json' web pnpm legacy:sync
            if ($LASTEXITCODE -ne 0) { throw "Incremental import failed (exit $LASTEXITCODE)" }
        } finally { Pop-Location }
        Write-State $source 'completed' 'Sync completed'
        Write-AgentLog "Sync completed: $runName"
        Get-ChildItem -LiteralPath $runsRoot -Directory | Sort-Object LastWriteTime -Descending | Select-Object -Skip 3 | Remove-Item -Recurse -Force
    } catch {
        $importFailure = $_
        $previousProgress = try { Get-Content -LiteralPath $progressPath -Raw -Encoding UTF8 | ConvertFrom-Json } catch { $null }
        Write-LegacyProgress -Path $progressPath -SourcePath $source.FullName -Status 'failed' -Phase 'failed' -Label $importFailure.Exception.Message -Percent $(if ($previousProgress) { $previousProgress.percent } else { 0 }) -StartedAt $startedAt
        Write-State $source 'failed' $importFailure.Exception.Message
        Write-AgentLog $importFailure.Exception.ToString() -ErrorLog
        throw
    }
}

if (-not $mutex.WaitOne(0)) { throw 'Legacy sync agent is already running' }
try {
    do {
        try { Invoke-Sync } catch {
            Write-Output $_.Exception.Message
            Write-AgentLog $_.Exception.ToString() -ErrorLog
            [ordered]@{
                sourcePath = $DatabasePath
                checkedAt = [DateTime]::UtcNow.ToString('o')
                status = 'failed'
                message = $_.Exception.Message
            } | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8
            if ($Once) { throw }
        }
        if (-not $Once) { Start-Sleep -Seconds ([Math]::Max(30, $IntervalSeconds)) }
    } while (-not $Once)
} finally {
    $mutex.ReleaseMutex()
    $mutex.Dispose()
}
