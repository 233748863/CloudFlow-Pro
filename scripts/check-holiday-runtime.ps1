$ErrorActionPreference = 'Stop'
$Workspace = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
. (Join-Path $Workspace '.cloudflow-runtime/batch-e-runtime/connection.ps1')
if ($DatabaseName -ne 'cloud_flow_db' -or -not $env:DB_USERNAME -or -not $env:DB_PASSWORD) { throw 'Protected runtime connection is required' }
$Sql = @'
START TRANSACTION READ ONLY;
SELECT CONCAT('A4_RUNTIME_TABLES=', COUNT(*)) FROM information_schema.tables
WHERE table_schema=DATABASE() AND table_name IN ('sys_holiday_calendar','sys_holiday_date');
SELECT CONCAT('A4_RUNTIME_MENU_IDS=', GROUP_CONCAT(menu_id ORDER BY menu_id)) FROM sys_menu WHERE perms LIKE 'system:holiday:%';
SELECT CONCAT('A4_RUNTIME_OUT_OF_RANGE=', COUNT(*)) FROM sys_menu WHERE perms LIKE 'system:holiday:%' AND menu_id NOT BETWEEN 1300 AND 1349;
SELECT CONCAT('A4_RUNTIME_EMPLOYEE_QUERY=', COALESCE(SUM(menu.perms='system:holiday:query'),0), '; NONQUERY=', COALESCE(SUM(menu.perms<>'system:holiday:query'),0))
FROM sys_role_menu relation JOIN sys_menu menu ON menu.menu_id=relation.menu_id
WHERE relation.role_id=5 AND menu.perms LIKE 'system:holiday:%';
SELECT CONCAT('A4_RUNTIME_ROLE=', role.role_id, ':', role.role_key, '; MAINTENANCE=', COALESCE(SUM(menu.perms IN ('system:holiday:add','system:holiday:edit','system:holiday:remove','system:holiday:import')),0))
FROM sys_role role LEFT JOIN sys_role_menu relation ON relation.role_id=role.role_id LEFT JOIN sys_menu menu ON menu.menu_id=relation.menu_id
WHERE role.role_id IN (1,2,4,5) GROUP BY role.role_id,role.role_key ORDER BY role.role_id;
COMMIT;
'@
$PreviousPassword = $env:MYSQL_PWD
try {
    $env:MYSQL_PWD = $env:DB_PASSWORD
    $Rows = @(& mysql.exe --no-defaults --protocol=TCP "--host=$DatabaseServer" "--port=$DatabasePort" "--user=$env:DB_USERNAME" "--database=$DatabaseName" --batch --raw --skip-column-names --default-character-set=utf8mb4 --execute $Sql)
    if ($LASTEXITCODE -ne 0) { throw 'Read-only holiday runtime inspection failed' }
    $Rows | Write-Output
    foreach ($Expected in @('A4_RUNTIME_TABLES=2', 'A4_RUNTIME_MENU_IDS=1320,1321,1322,1323,1324,1325', 'A4_RUNTIME_OUT_OF_RANGE=0', 'A4_RUNTIME_EMPLOYEE_QUERY=1; NONQUERY=0')) {
        if ($Rows -notcontains $Expected) { throw "Unexpected holiday runtime result: $Expected" }
    }
    Write-Output 'A4_RUNTIME_READ_ONLY=true; DATABASE_WRITES=0; SERVICE_RESTARTS=0'
} finally {
    $env:MYSQL_PWD = $PreviousPassword
}
