param(
    [string]$HostName = "192.168.1.173",
    [string]$User = "root",
    [string]$Database = "cloud_flow_db",
    [string]$Password = $env:MYSQL_PWD,
    [long[]]$EventIds = @(91529, 91530, 91531, 91532, 91533, 91535, 91536, 91537, 91538, 91539),
    [switch]$Execute
)

$ErrorActionPreference = "Stop"

if (-not $Password) {
    throw "MySQL password is required. Pass -Password or set MYSQL_PWD."
}

if (-not (Get-Command mysql -ErrorAction SilentlyContinue)) {
    throw "mysql client was not found in PATH."
}

if (-not $EventIds -or $EventIds.Count -eq 0) {
    throw "EventIds cannot be empty."
}

$invalid = $EventIds | Where-Object { $_ -le 0 }
if ($invalid) {
    throw "EventIds must be positive integers."
}

$idList = ($EventIds | Sort-Object -Unique) -join ","
$selectSql = @"
SELECT id, event_type, aggregate_type, aggregate_id, status, retry_count,
       next_retry_at, published_at, locked_by, locked_until, LEFT(COALESCE(last_error, ''), 160) AS last_error
FROM outbox_event
WHERE id IN ($idList)
ORDER BY id;
"@

$updateSql = @"
UPDATE outbox_event
SET status = 'PENDING',
    retry_count = 0,
    next_retry_at = NOW(),
    published_at = NULL,
    last_error = NULL,
    locked_by = NULL,
    locked_until = NULL
WHERE id IN ($idList)
  AND status = 'PUBLISHED';
SELECT ROW_COUNT() AS reset_count;
"@

$previousPassword = $env:MYSQL_PWD
$env:MYSQL_PWD = $Password
try {
    Write-Host "Target events:"
    mysql -h $HostName -u $User $Database --default-character-set=utf8mb4 -e $selectSql

    if (-not $Execute) {
        Write-Host "Dry run only. Re-run with -Execute to reset these events to PENDING."
        return
    }

    Write-Host "Resetting events to PENDING..."
    mysql -h $HostName -u $User $Database --default-character-set=utf8mb4 -e $updateSql

    Write-Host "Events after reset:"
    mysql -h $HostName -u $User $Database --default-character-set=utf8mb4 -e $selectSql
} finally {
    $env:MYSQL_PWD = $previousPassword
}
