param(
    [string]$DatabasePath = 'C:\Users\pos\Documents\database.mdb',
    [string]$OutputDirectory = 'C:\UPminimart\legacy-export',
    [switch]$SyncMode,
    [string]$ProgressPath = '',
    [string]$StartedAt = ([DateTime]::UtcNow.ToString('o'))
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'legacy-sync-progress.ps1')

function Get-LegacyConnectionString {
    param([string]$Path)
    $assembly = [Reflection.Assembly]::LoadFrom('C:\iSoft SaleStore\iSoftSaleStore.exe')
    $module = $assembly.ManifestModule
    $flags = [Reflection.BindingFlags]'Public,NonPublic,Static,Instance,DeclaredOnly'
    $strings = New-Object System.Collections.Generic.HashSet[string]
    foreach ($type in $assembly.GetTypes()) {
        foreach ($method in $type.GetMethods($flags)) {
            try { $body = $method.GetMethodBody() } catch { continue }
            if ($null -eq $body) { continue }
            $bytes = $body.GetILAsByteArray()
            for ($i = 0; $i -le $bytes.Length - 5; $i++) {
                if ($bytes[$i] -ne 0x72) { continue }
                try {
                    $value = $module.ResolveString([BitConverter]::ToInt32($bytes, $i + 1))
                    if ($value) { [void]$strings.Add($value) }
                } catch {}
            }
        }
    }
    $fragment = $strings | Where-Object { $_ -match ';Jet OLEDB:Database Password=' } | Select-Object -First 1
    if (-not $fragment) { throw 'Cannot locate the legacy database connection settings.' }
    $options = $fragment.Substring($fragment.IndexOf(';Jet OLEDB:Database Password='))
    "Provider=Microsoft.Jet.OLEDB.4.0;Data Source=$Path$options;Mode=Read;"
}

if (-not (Test-Path -LiteralPath $DatabasePath)) { throw "Database not found: $DatabasePath" }
if (-not ('LegacyCsvExporter' -as [type])) {
    Add-Type -Path (Join-Path $PSScriptRoot 'LegacyCsvExporter.cs') -ReferencedAssemblies 'System.Data', 'System.Xml'
}
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$source = Get-Item -LiteralPath $DatabasePath
$connection = New-Object Data.OleDb.OleDbConnection (Get-LegacyConnectionString $DatabasePath)
$connection.Open()
$results = @()
try {
    $tableNames = $connection.GetSchema('Tables') |
        Where-Object { $_.TABLE_TYPE -eq 'TABLE' -and $_.TABLE_NAME -notlike 'MSys*' -and $_.TABLE_NAME -notin @('login','Paste Errors') } |
        Select-Object -ExpandProperty TABLE_NAME |
        Sort-Object

    if ($SyncMode) {
        $syncTables = @('producttype','product','company','customer','salelist','salecancel','orderrec','stocklog','datashop')
        $tableNames = $tableNames | Where-Object { $_.ToLowerInvariant() -in $syncTables }
    }

    $tableCounts = @{}
    foreach ($tableName in $tableNames) {
        $countCommand = $connection.CreateCommand()
        try {
            $countCommand.CommandText = "SELECT COUNT(*) FROM [$($tableName.Replace(']', ']]'))]"
            $tableCounts[$tableName] = [long]$countCommand.ExecuteScalar()
        } finally { $countCommand.Dispose() }
    }
    $totalRows = [long](($tableCounts.Values | Measure-Object -Sum).Sum)
    $finishedRows = 0L
    foreach ($tableName in $tableNames) {
        $safeFileName = ($tableName -replace '[^a-zA-Z0-9_-]', '_').ToLowerInvariant()
        $csvPath = Join-Path $OutputDirectory "$safeFileName.csv"
        $tableTimer = [Diagnostics.Stopwatch]::StartNew()
        $tableLabel = switch ($tableName.ToLowerInvariant()) {
            'salelist' { 'ประวัติการขาย' }; 'stocklog' { 'ประวัติสต็อก' }; 'product' { 'สินค้า' }
            'orderrec' { 'รายการรับเข้า' }; default { 'ข้อมูลประกอบ' }
        }
        $onProgress = [Action[long]]{
            param([long]$Rows)
            $percent = if ($totalRows -gt 0) { 30 * ($finishedRows + $Rows) / $totalRows } else { 30 }
            Write-LegacyProgress -Path $ProgressPath -SourcePath $source.FullName -Status 'processing' -Phase 'export' -Label "อ่านไฟล์ MDB: $tableLabel" -Percent $percent -Processed $Rows -Total $tableCounts[$tableName] -Unit 'แถว' -StartedAt $StartedAt
        }
        $onProgress.Invoke(0)
        $rowCount = [LegacyCsvExporter]::ExportTable($connection, $tableName, $csvPath, $onProgress)
        $finishedRows += $rowCount
        $hash = (Get-FileHash -LiteralPath $csvPath -Algorithm SHA256).Hash.ToLowerInvariant()
        $results += [PSCustomObject]@{ table = $tableName; file = "$safeFileName.csv"; rows = $rowCount; sha256 = $hash }
        Write-Output ("Exported {0}: {1:N0} rows in {2:N2}s" -f $tableName, $rowCount, $tableTimer.Elapsed.TotalSeconds)
    }
} finally {
    $connection.Close()
}

$manifest = [ordered]@{
    version = $(if ($SyncMode) { 2 } else { 1 })
    mode = $(if ($SyncMode) { 'incremental-sync' } else { 'full-export' })
    exportedAt = [DateTime]::UtcNow.ToString('o')
    source = [ordered]@{
        path = $source.FullName
        bytes = $source.Length
        lastWriteTimeUtc = $source.LastWriteTimeUtc.ToString('o')
        sha256 = (Get-FileHash -LiteralPath $DatabasePath -Algorithm SHA256).Hash.ToLowerInvariant()
    }
    excludedTables = @('login','Paste Errors')
    tables = $results
}
$manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $OutputDirectory 'manifest.json') -Encoding UTF8
Write-Output "Manifest: $(Join-Path $OutputDirectory 'manifest.json')"
