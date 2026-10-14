param(
    [string]$ProjectDirectory = 'C:\UPminimart',
    [string]$AutoSourcePath = '',
    [int]$PollSeconds = 5
)

$ErrorActionPreference = 'Continue'
$syncRoot = Join-Path $ProjectDirectory 'legacy-sync'
$requestsRoot = Join-Path $syncRoot 'requests'
$configPath = Join-Path $syncRoot 'config.json'
$workerStatePath = Join-Path $syncRoot 'worker-state.json'
$agentPath = Join-Path $ProjectDirectory 'scripts\legacy-sync-agent.ps1'
$mutex = New-Object Threading.Mutex($false, 'Local\UPMinimartLegacySyncWorker')

New-Item -ItemType Directory -Force -Path $requestsRoot | Out-Null
if ([string]::IsNullOrWhiteSpace($AutoSourcePath)) {
    $settingPath = 'C:\iSoft SaleStore\Setting.txt'
    $AutoSourcePath = if (Test-Path -LiteralPath $settingPath) { (Get-Content -LiteralPath $settingPath -Raw -Encoding Default).Trim() } else { 'C:\Users\pos\Documents\database.mdb' }
}
if (-not (Test-Path -LiteralPath $configPath)) {
    [ordered]@{ autoEnabled = $false; autoSourcePath = $AutoSourcePath; intervalSeconds = 300; updatedAt = [DateTime]::UtcNow.ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding UTF8
}

function Write-WorkerState([string]$Status, [string]$Message) {
    [ordered]@{ status = $Status; message = $Message; pid = $PID; checkedAt = [DateTime]::UtcNow.ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath $workerStatePath -Encoding UTF8
}

function Save-Request($Request, [string]$Path) {
    $Request | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $Path -Encoding UTF8
}

function Invoke-Agent([string]$Path) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $agentPath -ProjectDirectory $ProjectDirectory -DatabasePath $Path -Once -Force
    if ($LASTEXITCODE -ne 0) { throw "Legacy import failed (exit $LASTEXITCODE)" }
}

function Process-Requests {
    $queued = Get-ChildItem -LiteralPath $requestsRoot -Filter '*.json' -File | Sort-Object Name | Where-Object {
        try { (Get-Content -LiteralPath $_.FullName -Raw -Encoding UTF8 | ConvertFrom-Json).status -eq 'queued' } catch { $false }
    }
    foreach ($file in $queued) {
        $request = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
        $request.status = 'processing'
        $request | Add-Member -NotePropertyName startedAt -NotePropertyValue ([DateTime]::UtcNow.ToString('o')) -Force
        $request.message = 'Importing MDB'
        Save-Request $request $file.FullName
        Write-WorkerState 'processing' "Importing $($request.originalName)"
        try {
            Invoke-Agent $request.databasePath
            $request.status = 'completed'; $request.message = 'Import completed'
        } catch {
            $request.status = 'failed'; $request.message = $_.Exception.Message
        }
        $request | Add-Member -NotePropertyName completedAt -NotePropertyValue ([DateTime]::UtcNow.ToString('o')) -Force
        Save-Request $request $file.FullName
    }
}

if (-not $mutex.WaitOne(0)) { throw 'Legacy sync worker is already running' }
try {
    $lastAutoCheck = [DateTime]::MinValue
    while ($true) {
        Process-Requests
        try { $config = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json } catch { $config = $null }
        if ($config -and $config.autoEnabled -eq $true) {
            $interval = [Math]::Max(30, [int]$config.intervalSeconds)
            if (((Get-Date) - $lastAutoCheck).TotalSeconds -ge $interval) {
                $lastAutoCheck = Get-Date
                Write-WorkerState 'auto-check' "Checking $($config.autoSourcePath)"
                try { Invoke-Agent ([string]$config.autoSourcePath) } catch { Write-WorkerState 'failed' $_.Exception.Message }
            }
        } else {
            Write-WorkerState 'idle' 'Auto Sync is off; waiting for a manual MDB upload'
        }
        Start-Sleep -Seconds ([Math]::Max(2, $PollSeconds))
    }
} finally {
    $mutex.ReleaseMutex()
    $mutex.Dispose()
}
