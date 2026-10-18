param([Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$Round,
    [Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound)
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "d4-duration-boundaries-20261006-$Round"
if(Test-Path -LiteralPath $Output){throw 'Retain original scope evidence'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
$State=Get-Content -LiteralPath (Join-Path $Run 'state.json') -Raw|ConvertFrom-Json
if($State.status -ne 'RUNNING' -or [IO.Path]::GetFullPath($State.run) -ne $Run){throw 'Owned running fixture required'}
foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";if(-not $Observed -or -not $Observed.CommandLine.Contains($Entry.marker)){throw 'Owned process mismatch'}}
$Inputs=@(Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-20261002-backend-$BackendRound-inputs.json") -Raw|ConvertFrom-Json)
foreach($File in @('scripts/run-d4-duration-boundaries.ps1','scripts/hr-checks/HrGrievanceDurationChecks.java')){
    $Inputs+=[pscustomobject]@{Path=$File;Hash=(Get-FileHash -LiteralPath (Join-Path $Root $File)).Hash}
    [IO.File]::Copy((Join-Path $Root $File),(Join-Path $Output ('original-'+(Split-Path -Leaf $File))),$false)
}
function Assert-Inputs {foreach($Item in $Inputs){if((Get-FileHash -LiteralPath (Join-Path $Root $Item.Path)).Hash -ne $Item.Hash){throw 'Scope input changed'}}}
Assert-Inputs
$Inputs|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
$Backend=Join-Path $Root 'cloudflow-backend'
$Module=Join-Path $Backend 'cloudflow-service-hr'
$Dependencies=(Get-Content -LiteralPath (Join-Path $Module 'target/batch-d-classpath.txt') -Raw).Trim().Split([IO.Path]::PathSeparator)
$Common=@(Get-ChildItem -LiteralPath (Join-Path $Backend 'cloudflow-common') -Directory|Where-Object{Test-Path -LiteralPath (Join-Path $_.FullName 'target/classes')})
foreach($Entry in $Common){$Dependencies=@($Dependencies|Where-Object{[IO.Path]::GetFileName($_) -notlike "$($Entry.Name)-*.jar"})}
$Classpath=(@((Join-Path $Module 'target/classes'))+@($Common|ForEach-Object{Join-Path $_.FullName 'target/classes'})+$Dependencies)-join [IO.Path]::PathSeparator
$Compile=@('-encoding','UTF-8','-cp',('"'+$Classpath.Replace('\','/')+'"'),'-d',('"'+$Output.Replace('\','/')+'"'),('"'+(Join-Path $Root 'scripts/hr-checks/HrGrievanceDurationChecks.java').Replace('\','/')+'"'))
[IO.File]::WriteAllLines((Join-Path $Output 'compile.args'),$Compile,[Text.UTF8Encoding]::new($false))
Push-Location $Root
$Schema='d4_duration_'+[guid]::NewGuid().ToString('N')
$MysqlArguments=@('--no-defaults','--protocol=TCP','--host=127.0.0.1',"--port=$($State.mysqlPort)",'--user=root','--skip-password','--batch','--raw','--skip-column-names','--default-character-set=utf8mb4')
$PreviousMysqlPassword=$env:MYSQL_PWD
$env:MYSQL_PWD=$null
function Invoke-OwnedSql([string]$Statement) {
    $Result=$Statement | & mysql.exe @MysqlArguments 2>> (Join-Path $Output 'mysql.err')
    if($LASTEXITCODE -ne 0){throw 'Owned scratch SQL failed'}
    return $Result
}
$Created=$false
try {
    & javac "@$(Join-Path $Output 'compile.args')" *> (Join-Path $Output 'compile.log')
    if($LASTEXITCODE -ne 0){throw 'Scope check compilation failed; retain compile.log'}
    $DataDirectory=[string](Invoke-OwnedSql 'SELECT @@datadir')
    if((Resolve-Path -LiteralPath $DataDirectory).Path.TrimEnd('\','/') -ne (Resolve-Path -LiteralPath (Join-Path $Run 'mysql-data')).Path.TrimEnd('\','/')){throw 'Owned MySQL directory mismatch'}
    if($Schema -notmatch '^d4_duration_[a-f0-9]{32}$'){throw 'Invalid scratch schema'}
    Invoke-OwnedSql "CREATE DATABASE $Schema CHARACTER SET utf8mb4"|Out-Null
    $Created=$true
    foreach($Table in @('sys_tenant','sys_dept','hr_employee','hr_grievance','hr_grievance_record','hr_audit_log')){Invoke-OwnedSql "CREATE TABLE $Schema.$Table LIKE cloud_flow_db.$Table"|Out-Null}
    $Arguments=@('-cp',('"'+($Output+[IO.Path]::PathSeparator+$Classpath).Replace('\','/')+'"'),'com.cloudflow.hr.checks.HrGrievanceDurationChecks',
        "jdbc:mysql://127.0.0.1:$($State.mysqlPort)/$($Schema)?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai",('"'+(Join-Path $Run 'mysql-data').Replace('\','/')+'"'))
    [IO.File]::WriteAllLines((Join-Path $Output 'run.args'),$Arguments,[Text.UTF8Encoding]::new($false))
    & java "@$(Join-Path $Output 'run.args')" *> (Join-Path $Output 'live.log')
    $RunExit=$LASTEXITCODE
    Assert-Inputs
    Get-Content -LiteralPath (Join-Path $Output 'live.log')|Where-Object{$_ -match '^D4_'}
    [pscustomobject]@{passed=($RunExit -eq 0);backend=$BackendRound;inputs=$Inputs.Count;inputChanges=0;exit=$RunExit}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
    if($RunExit -ne 0){throw 'Scope verification failed; retain evidence'}
    'D4_DURATION_RUN_EXIT=0'
} finally {
    if($Created){
        if($Schema -notmatch '^d4_duration_[a-f0-9]{32}$' -or (Resolve-Path -LiteralPath ([string](Invoke-OwnedSql 'SELECT @@datadir'))).Path.TrimEnd('\','/') -ne (Resolve-Path -LiteralPath (Join-Path $Run 'mysql-data')).Path.TrimEnd('\','/')){throw 'Scratch cleanup ownership mismatch'}
        Invoke-OwnedSql "DROP DATABASE $Schema"|Out-Null
        'D4_DURATION_SCRATCH_REMOVED=true'
    }
    $env:MYSQL_PWD=$PreviousMysqlPassword
    Pop-Location
}
