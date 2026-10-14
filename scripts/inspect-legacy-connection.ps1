param(
    [string]$DatabasePath = 'C:\Users\pos\Documents\database.mdb',
    [switch]$ShowColumns
)
$ErrorActionPreference = 'Stop'
$assemblyPath = 'C:\iSoft SaleStore\iSoftSaleStore.exe'
$assembly = [Reflection.Assembly]::LoadFrom($assemblyPath)
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
            $token = [BitConverter]::ToInt32($bytes, $i + 1)
            try {
                $value = $module.ResolveString($token)
                if ($value) { [void]$strings.Add($value) }
            } catch {}
        }
    }
}

$passwordFragment = $strings | Where-Object { $_ -match ';Jet OLEDB:Database Password=' } | Select-Object -First 1
if (-not $passwordFragment) { throw 'Legacy Access password fragment was not found.' }
$passwordOptions = $passwordFragment.Substring($passwordFragment.IndexOf(';Jet OLEDB:Database Password='))
$connectionString = "Provider=Microsoft.Jet.OLEDB.4.0;Data Source=$DatabasePath$passwordOptions;Mode=Read;"
$connection = New-Object System.Data.OleDb.OleDbConnection $connectionString
$connection.Open()
try {
    $tables = $connection.GetSchema('Tables') | Where-Object { $_.TABLE_TYPE -eq 'TABLE' -and $_.TABLE_NAME -notlike 'MSys*' }
    foreach ($table in ($tables | Sort-Object TABLE_NAME)) {
        $escapedName = $table.TABLE_NAME.Replace(']', ']]')
        $command = $connection.CreateCommand()
        $command.CommandText = "SELECT COUNT(*) FROM [$escapedName]"
        [PSCustomObject]@{ Table = $table.TABLE_NAME; Rows = [int]$command.ExecuteScalar() }
        $command.Dispose()
    }
    if ($ShowColumns) {
        "`n--- COLUMNS ---"
        $important = @('product','producttype','company','customer','orderlist','orderrec','sale','salelist','stocklog','returnlist','salecancel','promotion','datashop')
        $connection.GetSchema('Columns') |
            Where-Object { $_.TABLE_NAME -in $important } |
            Sort-Object TABLE_NAME, ORDINAL_POSITION |
            Select-Object TABLE_NAME,COLUMN_NAME,TYPE_NAME,CHARACTER_MAXIMUM_LENGTH,IS_NULLABLE |
            Format-Table -AutoSize
    }
} finally {
    $connection.Close()
}
