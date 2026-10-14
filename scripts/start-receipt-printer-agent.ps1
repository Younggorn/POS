param([string]$PrinterName = "BIXOLON SRP-E302", [int]$Port = 18181)
$ErrorActionPreference = "Stop"
$agent = Join-Path $PSScriptRoot "receipt-printer-agent.ps1"
$log = Join-Path $PSScriptRoot "receipt-printer-agent.log"
$errorLog = Join-Path $PSScriptRoot "receipt-printer-agent-error.log"
if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) { Write-Host "Receipt printer agent is already running on port $Port."; exit }
$escapedPrinterName = $PrinterName.Replace("'", "''")
$command = "& ([scriptblock]::Create((Get-Content -Raw -Encoding UTF8 '$agent'))) -PrinterName '$escapedPrinterName' -Port $Port"
$encodedCommand = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($command))
$arguments = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", $encodedCommand)
$process = Start-Process "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" -ArgumentList $arguments -WindowStyle Hidden -PassThru -RedirectStandardOutput $log -RedirectStandardError $errorLog
Start-Sleep -Seconds 2
if ($process.HasExited) { throw "เปิดตัวเชื่อมเครื่องพิมพ์ไม่สำเร็จ: $(Get-Content -Raw $errorLog -ErrorAction SilentlyContinue)" }
Write-Host "Receipt printer agent started (PID $($process.Id), printer $PrinterName, port $Port)."
