param([Parameter(Mandatory = $true)][string]$StatePath, [switch]$Apply, [switch]$NicknameOnly)

$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$StateFile = (Resolve-Path -LiteralPath $StatePath).Path
$Run = Split-Path -Parent $StateFile
$Runtime = Join-Path $Root '.cloudflow-runtime/batch-g-integration'
if ((Split-Path -Parent $Run) -ne $Runtime -or (Split-Path -Leaf $Run) -notmatch '^[a-f0-9]{32}$' -or (Split-Path -Leaf $StateFile) -ne 'state.json') { throw 'Owned isolated state required' }
$Data = Join-Path $Run 'mysql-data'
foreach ($Candidate in @($Root, $Runtime, $Run, $StateFile, $Data)) {
    if ((Get-Item -LiteralPath $Candidate).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Redirected test path rejected' }
}
$State = Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json
if ($State.status -ne 'RUNNING' -or [IO.Path]::GetFullPath($State.run) -ne $Run -or $State.mysqlPort -lt 1024 -or $State.mysqlPort -gt 65535) { throw 'Running isolated environment required' }
$Owned = @($State.processes | Where-Object name -EQ 'mysql')
if ($Owned.Count -ne 1 -or $Owned[0].marker -ne $Data) { throw 'Unique owned database marker required' }
$Process = Get-CimInstance Win32_Process -Filter "ProcessId = $($Owned[0].id)"
if (-not $Process -or $Process.Name -ne 'mysqld.exe' -or -not $Process.CommandLine.Contains($Data)) { throw 'Database ownership mismatch' }
$Listeners = @(Get-NetTCPConnection -State Listen -LocalPort $State.mysqlPort)
if ($Listeners.Count -ne 1 -or $Listeners[0].LocalAddress -ne '127.0.0.1') { throw 'Loopback-only database required' }
$Listener = Get-CimInstance Win32_Process -Filter "ProcessId = $($Listeners[0].OwningProcess)"
if (-not $Listener -or $Listener.Name -ne 'mysqld.exe' -or -not $Listener.CommandLine.Contains($Data) -or ($Listener.ProcessId -ne $Owned[0].id -and $Listener.ParentProcessId -ne $Owned[0].id)) { throw 'Database listener ownership mismatch' }
$Mysql = (Get-Command mysql.exe).Source
function Invoke-OwnedSql([string]$Sql) {
    $Info = [Diagnostics.ProcessStartInfo]::new($Mysql)
    $Info.UseShellExecute = $false; $Info.CreateNoWindow = $true
    $Info.RedirectStandardInput = $true; $Info.RedirectStandardOutput = $true; $Info.RedirectStandardError = $true
    $Info.StandardInputEncoding = [Text.UTF8Encoding]::new($false); $Info.StandardOutputEncoding = [Text.UTF8Encoding]::new($false)
    $Info.Environment.Remove('MYSQL_PWD') | Out-Null
    foreach ($Argument in @('--no-defaults','--protocol=TCP','--host=127.0.0.1',"--port=$($State.mysqlPort)",'--user=root','--skip-password','--batch','--raw','--skip-column-names','--default-character-set=utf8mb4')) { $Info.ArgumentList.Add($Argument) }
    $Child = [Diagnostics.Process]::Start($Info)
    $Output = $Child.StandardOutput.ReadToEndAsync(); $Errors = $Child.StandardError.ReadToEndAsync()
    $Child.StandardInput.WriteLine($Sql); $Child.StandardInput.Close()
    if (-not $Child.WaitForExit(120000)) { $Child.Kill(); throw 'Owned SQL client timed out' }
    if ($Child.ExitCode -ne 0) { throw $Errors.GetAwaiter().GetResult() }
    return $Output.GetAwaiter().GetResult().Trim()
}
function Confirm-OwnedData {
    if ([IO.Path]::GetFullPath((Invoke-OwnedSql 'SELECT @@datadir;')).TrimEnd('\','/') -ne $Data.TrimEnd('\','/')) { throw 'Database data directory mismatch' }
}
Confirm-OwnedData
$Columns = @(
    @{ Table='hr_candidate'; Column='email'; Old=120; New=254; File='03.cloudflow-hr.sql' },
    @{ Table='hr_resume_parsed_fields'; Column='parsed_email'; Old=120; New=254; File='03.cloudflow-hr.sql' },
    @{ Table='hr_employee'; Column='email'; Old=120; New=512; File='03.cloudflow-hr.sql' },
    @{ Table='hr_employee'; Column='phone'; Old=30; New=64; File='03.cloudflow-hr.sql' },
    @{ Table='sys_user'; Column='email'; Old=50; New=254; File='01.cloudflow-common.sql' },
    @{ Table='sys_user'; Column='phonenumber'; Old=11; New=16; File='01.cloudflow-common.sql' }
)
if ($NicknameOnly) {
    $Columns = @(@{ Table='sys_user'; Column='nick_name'; Old=30; New=100; File='01.cloudflow-common.sql' })
}
$Proposal = [IO.File]::ReadAllText((Join-Path $Root 'docs/design/H2-人事增强提案DDL.sql'))
$Statements = @()
$TableCountSql = "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_type='BASE TABLE';"
$OriginalCount = Invoke-OwnedSql $TableCountSql
foreach ($Group in @($Columns | Group-Object Table)) {
    $Changes = @()
    foreach ($Column in $Group.Group) {
        $Schema = [IO.File]::ReadAllText((Join-Path $Root ('cloudflow-backend/DB/' + $Column.File)))
        $Definition = [regex]::Match($Schema, "(?ms)^CREATE TABLE $($Column.Table) \(.+?^\) ENGINE=[^\r\n]*;").Value
        $Line = [regex]::Match($Definition, "(?m)^\s+$($Column.Column) VARCHAR\($($Column.New)\)[^\r\n]*").Value.Trim().TrimEnd(',')
        if (-not $Line) {
            $Line = [regex]::Match($Definition, "(?m)^\s+$($Column.Column)\s+VARCHAR\($($Column.New)\)[^\r\n]*").Value.Trim().TrimEnd(',')
        }
        $Approved = [regex]::Match($Proposal, "(?ms)^ALTER TABLE $($Column.Table)\r?\n.+?;").Value
        $Normalized = [regex]::Replace($Line, '\s+', ' ')
        if (-not $Line -or -not [regex]::Replace($Approved, '\s+', ' ').Contains("MODIFY COLUMN $Normalized")) { throw 'Formal contact definition differs from approval' }
        $Width = Invoke-OwnedSql "SELECT character_maximum_length FROM information_schema.columns WHERE table_schema='cloud_flow_db' AND table_name='$($Column.Table)' AND column_name='$($Column.Column)' AND data_type='varchar';"
        if ([string]$Width -notin @([string]$Column.Old,[string]$Column.New)) { throw 'Contact capacity baseline differs from approved old/new definitions' }
        Write-Output "H2_CONTACT_CAPACITY_PREFLIGHT: column=$($Column.Table).$($Column.Column); actual=$Width; approved=$($Column.New)"
        if ([int]$Width -eq $Column.Old) { $Changes += "MODIFY COLUMN $Line" }
    }
    if ($Changes.Count -gt 0) { $Statements += "ALTER TABLE cloud_flow_db.$($Group.Name) " + ($Changes -join ', ') + ';' }
}
if (-not $Apply) { Write-Output "H2_CONTACT_CAPACITY_PREPARE: preflight=true; tables=$OriginalCount; pending_tables=$($Statements.Count); database_writes=0; production_modified=false"; exit 0 }
function Read-ContactDigests {
    $Values = @()
    if ($NicknameOnly) {
        $Values += Invoke-OwnedSql "SELECT user_id,tenant_id,SHA2(HEX(nick_name),256) FROM cloud_flow_db.sys_user ORDER BY user_id;"
    }
    foreach ($Query in @(
        "SELECT COUNT(*),SHA2(COALESCE(GROUP_CONCAT(SHA2(CAST(JSON_ARRAY(id,tenant_id,email,phone) AS CHAR),256) ORDER BY id SEPARATOR ''),''),256) FROM cloud_flow_db.hr_candidate;",
        "SELECT COUNT(*),SHA2(COALESCE(GROUP_CONCAT(SHA2(CAST(JSON_ARRAY(id,tenant_id,parsed_email,parsed_phone) AS CHAR),256) ORDER BY id SEPARATOR ''),''),256) FROM cloud_flow_db.hr_resume_parsed_fields;",
        "SELECT COUNT(*),SHA2(COALESCE(GROUP_CONCAT(SHA2(CAST(JSON_ARRAY(id,tenant_id,email,phone) AS CHAR),256) ORDER BY id SEPARATOR ''),''),256) FROM cloud_flow_db.hr_employee;",
        "SELECT COUNT(*),SHA2(COALESCE(GROUP_CONCAT(SHA2(CAST(JSON_ARRAY(user_id,tenant_id,email,phonenumber) AS CHAR),256) ORDER BY user_id SEPARATOR ''),''),256) FROM cloud_flow_db.sys_user;"
    )) { $Values += Invoke-OwnedSql ('SET SESSION group_concat_max_len=8388608; ' + $Query) }
    return $Values
}
$Before = @(Read-ContactDigests)
$Evidence = Join-Path $Run ('hr-contact-capacity-prepare-' + [Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($Evidence) | Out-Null
$Projection = $Statements -join [Environment]::NewLine
[IO.File]::WriteAllText((Join-Path $Evidence 'approved-projection.sql'), $Projection, [Text.UTF8Encoding]::new($false))
Confirm-OwnedData
if ($Statements.Count -gt 0) { Invoke-OwnedSql $Projection | Out-Null }
if (Compare-Object $Before @(Read-ContactDigests)) { throw 'Existing contact data changed during isolated capacity preparation' }
foreach ($Column in $Columns) {
    $Width = Invoke-OwnedSql "SELECT character_maximum_length FROM information_schema.columns WHERE table_schema='cloud_flow_db' AND table_name='$($Column.Table)' AND column_name='$($Column.Column)';"
    if ([int]$Width -ne $Column.New) { throw 'Contact capacity verification failed after isolated application' }
}
if ((Invoke-OwnedSql $TableCountSql) -ne $OriginalCount) { throw 'Contact preparation changed table count' }
Write-Output "H2_CONTACT_CAPACITY_PREPARE: applied=true; nickname_only=$($NicknameOnly.IsPresent); changed_tables=$($Statements.Count); columns_verified=$($Columns.Count); tables=$OriginalCount; existing_contacts_unchanged=true; existing_names_unchanged=true; menus_changed=0; country_codes_inferred=0; production_modified=false"
