param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime/use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "h3-portal-finance-database-20261002-$Round"
if (Test-Path -LiteralPath $Output) { throw 'Retain existing evidence; use a new round' }
[IO.Directory]::CreateDirectory($Output) | Out-Null
$StatePath=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/state.json'
& (Join-Path $Root 'scripts/inspect-portal-finance-proposal.ps1') -StatePath $StatePath -Installed -OutputPath (Join-Path $Evidence "h3-finance-database-preflight-20261002-$Round.json") *> (Join-Path $Output 'preflight.log')
$State=Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
$Schema='cf_h3_finance_'+[Guid]::NewGuid().ToString('N')
if ($Schema -notmatch '^cf_h3_finance_[a-f0-9]{32}$') { throw 'Invalid isolated schema name' }
$Sql=[Text.StringBuilder]::new()
[void]$Sql.AppendLine("CREATE DATABASE $Schema CHARACTER SET utf8mb4;")
[void]$Sql.AppendLine("USE $Schema;")
$Definitions=@{}
$SqlPaths=@('01.cloudflow-common.sql','04.cloudflow-oa.sql','05.cloudflow-crm.sql') | ForEach-Object { Join-Path $Root "cloudflow-backend/DB/$_" }
foreach ($File in $SqlPaths) {
    $Source=[IO.File]::ReadAllText($File)
    foreach ($Table in @('sys_tenant','sys_portal_user','sys_file','crm_customer','crm_contact','crm_receivable','oa_invoice')) {
        $Definition=[regex]::Match($Source,('(?ms)^CREATE TABLE\s+`?'+$Table+'`?\s*\(.*?^\).*?;')).Value
        if ($Definition) {
            if ($Definitions.ContainsKey($Table)) { throw 'Duplicate formal table definition' }
            $Definitions[$Table]=$Definition
        }
    }
}
if ($Definitions.Count -ne 7) { throw 'Seven formal table definitions required' }
foreach ($Table in @('sys_tenant','sys_portal_user','sys_file','crm_customer','crm_contact','crm_receivable','oa_invoice')) { [void]$Sql.AppendLine($Definitions[$Table]) }
$SchemaPath=Join-Path $Output 'schema.sql'
[IO.File]::WriteAllText($SchemaPath,$Sql.ToString(),[Text.UTF8Encoding]::new($false))
$Backend=Join-Path $Root 'cloudflow-backend'
$Modules=@('cloudflow-auth','cloudflow-service-crm','cloudflow-service-oa') | ForEach-Object { Join-Path $Backend $_ }
$Modules+=@(Get-ChildItem -LiteralPath (Join-Path $Backend 'cloudflow-common') -Directory | Select-Object -ExpandProperty FullName)
$Classes=@($Modules | ForEach-Object { Join-Path $_ 'target/classes' } | Where-Object { Test-Path -LiteralPath $_ })
$Dependencies=(Get-Content -LiteralPath (Join-Path $Backend 'cloudflow-auth/target/portal-classpath.txt') -Raw).Trim()
$Classpath=(@($Classes)+@($Dependencies)) -join [IO.Path]::PathSeparator
$TestSource=Join-Path $Root 'scripts/portal-checks/PortalFinanceDatabaseChecks.java'
$Paths=@($TestSource,$PSCommandPath)+$SqlPaths+@(rg --files --hidden --no-ignore $Backend -g '*Finance*.java' -g '*Finance*.xml' -g '!**/target/**')
$Before=@($Paths | ForEach-Object { [pscustomobject]@{Path=$_;Hash=(Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash} })
$Before | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
$Compile=Join-Path $Output 'compile.args'
[IO.File]::WriteAllLines($Compile,@('-encoding','UTF-8','-parameters','-proc:none','-classpath',('"'+$Classpath.Replace('\','/')+'"'),'-d',('"'+$Output.Replace('\','/')+'"'),('"'+$TestSource.Replace('\','/')+'"')),[Text.UTF8Encoding]::new($false))
& javac "@$Compile" *> (Join-Path $Output 'compile.log')
if ($LASTEXITCODE -ne 0) { throw 'Finance database checks compilation failed; retained log' }
$PreviousPassword=[Environment]::GetEnvironmentVariable('MYSQL_PWD','Process')
$PreviousUrl=[Environment]::GetEnvironmentVariable('CF_FINANCE_DB_URL','Process')
$PreviousSchema=[Environment]::GetEnvironmentVariable('CF_FINANCE_SCHEMA','Process')
$PreviousDirectory=[Environment]::GetEnvironmentVariable('CF_FINANCE_DATADIR','Process')
try {
    [Environment]::SetEnvironmentVariable('MYSQL_PWD',$null,'Process')
    $Sql.ToString() | & mysql.exe --no-defaults --protocol=TCP --host=127.0.0.1 "--port=$($State.mysqlPort)" --user=root --default-character-set=utf8mb4 *> (Join-Path $Output 'schema.log')
    if ($LASTEXITCODE -ne 0) { throw 'Isolated schema installation failed; retained log' }
    [Environment]::SetEnvironmentVariable('CF_FINANCE_DB_URL',"jdbc:mysql://127.0.0.1:$($State.mysqlPort)/$($Schema)?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai",'Process')
    [Environment]::SetEnvironmentVariable('CF_FINANCE_SCHEMA',$Schema,'Process')
    [Environment]::SetEnvironmentVariable('CF_FINANCE_DATADIR',(Join-Path $State.run 'mysql-data'),'Process')
    $Run=Join-Path $Output 'run.args'
    [IO.File]::WriteAllLines($Run,@('-classpath',('"'+($Output+';'+$Classpath).Replace('\','/')+'"'),'com.cloudflow.finance.checks.PortalFinanceDatabaseChecks'),[Text.UTF8Encoding]::new($false))
    Push-Location $Root
    try { & java "@$Run" *> (Join-Path $Output 'checks.log'); $RunExit=$LASTEXITCODE }
    finally { Pop-Location }
    [pscustomobject]@{Schema=$Schema;Exit=$RunExit;ProductionModified=$false;RetainedForReview=$true} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
    if ($RunExit -ne 0) { throw 'Finance database checks failed; retained isolated schema and log' }
    if (@($Before | Where-Object { (Get-FileHash -LiteralPath $_.Path -Algorithm SHA256).Hash -ne $_.Hash }).Count) { throw 'Verification inputs changed' }
    Get-Content -LiteralPath (Join-Path $Output 'checks.log') | Where-Object { $_ -match '^PORTAL_FINANCE_DATABASE_CHECKS:' }
} finally {
    [Environment]::SetEnvironmentVariable('MYSQL_PWD',$PreviousPassword,'Process')
    [Environment]::SetEnvironmentVariable('CF_FINANCE_DB_URL',$PreviousUrl,'Process')
    [Environment]::SetEnvironmentVariable('CF_FINANCE_SCHEMA',$PreviousSchema,'Process')
    [Environment]::SetEnvironmentVariable('CF_FINANCE_DATADIR',$PreviousDirectory,'Process')
}
