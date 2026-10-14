param(
    [string]$DatabasePath = 'C:\Users\pos\Documents\database.mdb',
    [string]$OutputDirectory = 'C:\UPminimart\legacy-export'
)

$ErrorActionPreference = 'Stop'
$source = Get-Item -LiteralPath $DatabasePath
$tables = @()
foreach ($file in (Get-ChildItem -LiteralPath $OutputDirectory -Filter '*.csv' | Sort-Object Name)) {
    $lineCount = 0
    $reader = New-Object IO.StreamReader($file.FullName)
    try { while ($null -ne $reader.ReadLine()) { $lineCount++ } } finally { $reader.Dispose() }
    $tables += [PSCustomObject][ordered]@{
        table = $file.BaseName
        file = $file.Name
        rows = [Math]::Max(0, $lineCount - 1)
        sha256 = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    }
}

$sourceHash = $null
try { $sourceHash = (Get-FileHash -LiteralPath $DatabasePath -Algorithm SHA256 -ErrorAction Stop).Hash.ToLowerInvariant() } catch {}
$manifest = [ordered]@{
    version = 1
    exportedAt = [DateTime]::UtcNow.ToString('o')
    source = [ordered]@{
        path = $source.FullName
        bytes = $source.Length
        lastWriteTimeUtc = $source.LastWriteTimeUtc.ToString('o')
        sha256 = $sourceHash
    }
    excludedTables = @('login','Paste Errors')
    tables = $tables
}
$manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $OutputDirectory 'manifest.json') -Encoding UTF8
Write-Output ("Manifest created for {0} tables and {1:N0} rows" -f $tables.Count, (($tables | Measure-Object -Property rows -Sum).Sum))
