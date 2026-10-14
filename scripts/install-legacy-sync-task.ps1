param(
    [string]$ProjectDirectory = 'C:\UPminimart',
    [string]$DatabasePath = '',
    [int]$IntervalSeconds = 300
)

$ErrorActionPreference = 'Stop'
$taskName = 'UP Minimart Legacy Sync'
$workerPath = Join-Path $ProjectDirectory 'scripts\legacy-sync-worker.ps1'
if (-not (Test-Path -LiteralPath $workerPath)) { throw "Sync worker not found: $workerPath" }
if ([string]::IsNullOrWhiteSpace($DatabasePath)) {
    $settingPath = 'C:\iSoft SaleStore\Setting.txt'
    $DatabasePath = if (Test-Path -LiteralPath $settingPath) { (Get-Content -LiteralPath $settingPath -Raw -Encoding Default).Trim() } else { 'C:\Users\pos\Documents\database.mdb' }
}

$syncRoot = Join-Path $ProjectDirectory 'legacy-sync'
$configPath = Join-Path $syncRoot 'config.json'
New-Item -ItemType Directory -Force -Path $syncRoot | Out-Null
if (-not (Test-Path -LiteralPath $configPath)) {
    [ordered]@{ autoEnabled = $false; autoSourcePath = $DatabasePath; intervalSeconds = $IntervalSeconds; updatedAt = [DateTime]::UtcNow.ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding UTF8
}
$argument = "-NoProfile -ExecutionPolicy Bypass -File `"$workerPath`" -ProjectDirectory `"$ProjectDirectory`" -AutoSourcePath `"$DatabasePath`""
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $argument -WorkingDirectory $ProjectDirectory
$trigger = @(
    New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
    New-ScheduledTaskTrigger -AtStartup
)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
$description = 'Runs the UP Minimart MDB import worker. Auto Sync is controlled from the Backup page and defaults to off.'
try {
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description $description -Force -ErrorAction Stop | Out-Null
} catch [Microsoft.Management.Infrastructure.CimException] {
    # AtStartup requires administrator rights on some Windows editions. AtLogOn
    # remains sufficient for this interactive store workstation.
    $logonTrigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $logonTrigger -Settings $settings -Description $description -Force | Out-Null
}
Start-ScheduledTask -TaskName $taskName
Write-Output "Installed and started scheduled task: $taskName"
