function Write-LegacyProgress {
    param([string]$Path, [string]$SourcePath, [string]$Status, [string]$Phase, [string]$Label,
          [double]$Percent, [long]$Processed = 0, [long]$Total = 0, [string]$Unit = 'รายการ', [string]$StartedAt)
    if ([string]::IsNullOrWhiteSpace($Path)) { return }
    $value = [ordered]@{ sourcePath = $SourcePath; status = $Status; phase = $Phase; label = $Label;
        percent = [Math]::Round([Math]::Max(0, [Math]::Min(100, $Percent)), 1);
        processed = $Processed; total = $Total; unit = $Unit; startedAt = $StartedAt;
        updatedAt = [DateTime]::UtcNow.ToString('o') }
    $temporary = "$Path.$PID.tmp"
    [IO.File]::WriteAllText($temporary, ($value | ConvertTo-Json), (New-Object Text.UTF8Encoding($false)))
    if ([IO.File]::Exists($Path)) { [IO.File]::Replace($temporary, $Path, [System.Management.Automation.Language.NullString]::Value) }
    else { [IO.File]::Move($temporary, $Path) }
}
