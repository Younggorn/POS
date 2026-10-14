param(
    [string]$ProjectDirectory = 'C:\UPminimart',
    [string]$DatabasePath = '',
    [int]$IntervalSeconds = 300,
    [switch]$Once,
    [switch]$Force
)

$scriptPath = Join-Path $ProjectDirectory 'scripts\legacy-sync-agent.ps1'
if ([string]::IsNullOrWhiteSpace($DatabasePath)) {
    $settingPath = 'C:\iSoft SaleStore\Setting.txt'
    $DatabasePath = if (Test-Path -LiteralPath $settingPath) { (Get-Content -LiteralPath $settingPath -Raw -Encoding Default).Trim() } else { 'C:\Users\pos\Documents\database.mdb' }
}
$arguments = @('-NoProfile','-ExecutionPolicy','Bypass','-File',"`"$scriptPath`"",'-ProjectDirectory',"`"$ProjectDirectory`"",'-DatabasePath',"`"$DatabasePath`"",'-IntervalSeconds',$IntervalSeconds)
if ($Once) { $arguments += '-Once' }
if ($Force) { $arguments += '-Force' }

if ($Once) {
    & powershell.exe @arguments
    exit $LASTEXITCODE
}

Start-Process -FilePath 'powershell.exe' -ArgumentList $arguments -WindowStyle Hidden -WorkingDirectory $ProjectDirectory
Write-Output "Legacy sync agent started: $DatabasePath (every $IntervalSeconds seconds)"
