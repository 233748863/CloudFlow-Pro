param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',[switch]$Apply)
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Reference=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$StatePath=Join-Path $Reference 'state.json'
$Data=Join-Path $Reference 'mysql-data'
$Output=Join-Path $Evidence "h3-commission-deployment-prep-20261011-$Round"
if(Test-Path -LiteralPath $Output){throw 'Retain previous commission deployment preparation'}
function Require([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message}}
function Json([string]$Path){Get-Content -LiteralPath $Path -Raw|ConvertFrom-Json -Depth 60}
$Independent=Join-Path $Evidence 'h3-commission-independent-20261010-r5'
$Launcher=Json (Join-Path $Independent 'launcher-result.json')
$Business=Json (Join-Path $Independent 'result.json')
Require ($Launcher.passed -and $Launcher.inputsUnchanged -and $Launcher.processesStopped -and $Launcher.referenceKept -and
    $Launcher.backend -eq 'r150' -and $Launcher.frontend -eq 'r103' -and $Business.passed -and
    $Business.checks.Count -eq 198 -and $Business.requests.Count -eq 87 -and $Business.uiRequests.Count -eq 318) 'Executed B150/F103 independent proof required'
$Review=Json (Join-Path $Evidence 'h3-commission-image-review-20261011-r1/manifest.json')
Require ($Review.ActuallyViewed -and $Review.VisualAccepted -and $Review.Images.Count -eq 8 -and
    $Review.OriginalResultHash -eq (Get-FileHash -LiteralPath (Join-Path $Independent 'result.json')).Hash) 'Complete unchanged image evidence required'
foreach($Image in $Review.Images){
    Require ($Image.ActuallyViewed -and $Image.Accepted -and
        (Get-FileHash -LiteralPath (Join-Path $Independent $Image.Name)).Hash -eq $Image.Hash) 'Viewed image changed'
}
foreach($Definition in @(
    @{Name='h2-settlement-validation-run-20261006-r3';Version='BackendRound'},
    @{Name='h2-current-compensation-checks-20261007-r3';Version='BackendRound'},
    @{Name='d3-payroll-replay-20261006-r5';Version='BackendRound'},
    @{Name='d3-generation-resume-20261006-r3';Version='BackendRound'},
    @{Name='h3-commission-advance-20261011-r1';Version='Backend'})){
    $Proof=Json (Join-Path $Evidence ($Definition.Name+'/result.json'))
    Require ($Proof.Passed -and $Proof.($Definition.Version) -eq 'r150' -and $Proof.InputChanges -eq 0) 'Current associated payroll verification required'
}
$InputIndex=@{}
foreach($Entry in @(Json (Join-Path $Independent 'inputs.json'))){$InputIndex[[IO.Path]::GetFullPath($Entry.Path,$Root)]=$Entry.Hash}
$Paths=@($StatePath)
foreach($Service in @('auth','gateway','oa','crm','workflow','hr')){
    $Paths+=@((Join-Path $Reference "$Service/service.args"),(Join-Path $Reference "$Service/integration.properties"))
}
foreach($Path in @($Root,$Reference,$StatePath,$Data)){
    Require (-not ((Get-Item -LiteralPath $Path).Attributes -band [IO.FileAttributes]::ReparsePoint)) 'Redirected runtime path rejected'
}
$State=Json $StatePath
Require ($State.status -eq 'RUNNING' -and [IO.Path]::GetFullPath($State.run) -eq $Reference -and
    $State.processes.Count -eq 9 -and $State.services.Count -eq 6 -and $State.mysqlPort -ge 1024 -and $State.mysqlPort -le 65535) 'Current owned runtime required'
foreach($Entry in $State.processes){
    $Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)"
    Require ($Observed -and $Observed.CommandLine.Contains($Entry.marker)) 'Original runtime process differs'
}
$Owned=@($State.processes|Where-Object name -EQ 'mysql')
Require ($Owned.Count -eq 1 -and $Owned[0].marker -eq $Data) 'Unique owned database marker required'
$Listeners=@(Get-NetTCPConnection -State Listen -LocalPort $State.mysqlPort)
Require ($Listeners.Count -eq 1 -and $Listeners[0].LocalAddress -eq '127.0.0.1') 'Loopback database required'
$Listener=Get-CimInstance Win32_Process -Filter "ProcessId=$($Listeners[0].OwningProcess)"
Require ($Listener -and $Listener.Name -eq 'mysqld.exe' -and $Listener.CommandLine.Contains($Data) -and
    ($Listener.ProcessId -eq $Owned[0].id -or $Listener.ParentProcessId -eq $Owned[0].id)) 'Database listener identity differs'
$Mysql=(Get-Command mysql.exe).Source
function Sql([string]$Statement){
    $Info=[Diagnostics.ProcessStartInfo]::new($Mysql)
    $Info.UseShellExecute=$false;$Info.CreateNoWindow=$true
    $Info.RedirectStandardInput=$true;$Info.RedirectStandardOutput=$true;$Info.RedirectStandardError=$true
    $Info.StandardInputEncoding=[Text.UTF8Encoding]::new($false);$Info.StandardOutputEncoding=[Text.UTF8Encoding]::new($false)
    $Info.Environment.Remove('MYSQL_PWD')|Out-Null
    foreach($Argument in @('--no-defaults','--protocol=TCP','--host=127.0.0.1',"--port=$($State.mysqlPort)",'--user=root','--skip-password','--batch','--raw','--skip-column-names','--default-character-set=utf8mb4','cloud_flow_db')){$Info.ArgumentList.Add($Argument)}
    $Child=[Diagnostics.Process]::Start($Info)
    $SqlOutput=$Child.StandardOutput.ReadToEndAsync();$SqlErrors=$Child.StandardError.ReadToEndAsync()
    $Child.StandardInput.WriteLine($Statement);$Child.StandardInput.Close()
    if(-not $Child.WaitForExit(30000)){$Child.Kill();throw 'Owned commission menu SQL timed out'}
    Require ($Child.ExitCode -eq 0) 'Owned commission menu SQL rejected; diagnostics withheld'
    return $SqlOutput.GetAwaiter().GetResult().Trim()
}
Require ([IO.Path]::GetFullPath((Sql 'SELECT @@datadir;')).TrimEnd('\','/') -eq $Data) 'Database data directory differs'
Require ((Sql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_type='BASE TABLE';") -eq '374') 'Approved 374-table database required'
Require ((Sql "SELECT COUNT(*) FROM sys_menu WHERE menu_id IN (1907,1908) OR perms IN ('crm:deal-allocation:list','crm:commission:manage');") -eq '0' -and
    (Sql 'SELECT COUNT(*) FROM sys_role_menu WHERE menu_id IN (1907,1908);') -eq '0') 'Commission menu or authorization already occupied'
Require ((Sql "SELECT COUNT(*) FROM sys_menu WHERE menu_id=8 AND status='0';") -eq '1') 'Active customer operations parent required'
$SeedPath=Join-Path $Root 'cloudflow-backend/DB/06.cloudflow-business-seed.sql'
$SeedHash=(Get-FileHash -LiteralPath $SeedPath).Hash
$Block=[regex]::Match([IO.File]::ReadAllText($SeedPath),'(?s)-- batch-h3-commission-menus:start.*?-- batch-h3-commission-menus:end').Value
Require ($Block -and $Block.Contains("'crm:deal-allocation:list'") -and $Block.Contains("'crm:commission:manage'") -and
    $Block.Contains('role.role_id IN (1,3,4,8)') -and $Block.Contains('role.role_id IN (1,3,4)')) 'Approved complete commission menu block required'
[IO.Directory]::CreateDirectory($Output)|Out-Null
Set-Acl -LiteralPath $Output -AclObject (Get-Acl -LiteralPath $Reference)
$Originals=@(foreach($Path in $Paths){
    $Path=[IO.Path]::GetFullPath($Path)
    Require ($Path.StartsWith($Reference+'\',[StringComparison]::OrdinalIgnoreCase) -and
        -not ((Get-Item -LiteralPath $Path).Attributes -band [IO.FileAttributes]::ReparsePoint)) 'Owned reference configuration required'
    $Hash=(Get-FileHash -LiteralPath $Path).Hash
    Require ($InputIndex.ContainsKey($Path) -and $InputIndex[$Path] -eq $Hash) 'Reference configuration differs from executed independent inputs'
    $Copy=Join-Path $Output ('originals/'+[IO.Path]::GetRelativePath($Root,$Path))
    [IO.Directory]::CreateDirectory((Split-Path -Parent $Copy))|Out-Null
    [IO.File]::Copy($Path,$Copy,$false)
    Require ((Get-FileHash -LiteralPath $Path).Hash -eq $Hash -and (Get-FileHash -LiteralPath $Copy).Hash -eq $Hash) 'Reference changed during preservation'
    [pscustomobject]@{Path=$Path;Hash=$Hash;PreservedAt=$Copy}
})
$Originals|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $Output 'before-inputs.json') -Encoding utf8NoBOM
[IO.File]::Copy($PSCommandPath,(Join-Path $Output 'original.ps1'),$false)
[IO.File]::WriteAllText((Join-Path $Output 'approved-menu.sql'),$Block,[Text.UTF8Encoding]::new($false))
$BeforeMenus=Sql 'SELECT * FROM sys_menu ORDER BY menu_id;'
$BeforeGrants=Sql 'SELECT * FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;'
[IO.File]::WriteAllText((Join-Path $Output 'menus-before.tsv'),$BeforeMenus,[Text.UTF8Encoding]::new($false))
[IO.File]::WriteAllText((Join-Path $Output 'grants-before.tsv'),$BeforeGrants,[Text.UTF8Encoding]::new($false))
if($Apply){
    Require ((Get-FileHash -LiteralPath $SeedPath).Hash -eq $SeedHash) 'Formal menu source changed'
    Sql ("START TRANSACTION;`n"+$Block+"`nCOMMIT;")|Out-Null
    Require ((Sql 'SELECT * FROM sys_menu WHERE menu_id NOT IN (1907,1908) ORDER BY menu_id;') -eq $BeforeMenus -and
        (Sql 'SELECT * FROM sys_role_menu WHERE menu_id NOT IN (1907,1908) ORDER BY tenant_id,role_id,menu_id;') -eq $BeforeGrants) 'Unrelated menu or authorization changed'
    Require ((Sql "SELECT COUNT(*) FROM sys_menu WHERE menu_id=1907 AND parent_id=8 AND menu_type='C' AND visible='0' AND status='0' AND perms='crm:deal-allocation:list' AND path='/crm/deal-allocations' AND component='pages/crm/CrmDealAllocationPage';") -eq '1' -and
        (Sql "SELECT COUNT(*) FROM sys_menu WHERE menu_id=1908 AND parent_id=1907 AND menu_type='F' AND visible='1' AND status='0' AND perms='crm:commission:manage' AND path='';") -eq '1') 'Installed commission menu differs'
    $Grants=Sql "SELECT GROUP_CONCAT(CONCAT(menu_id,':',role_id,':',tenant_id) ORDER BY menu_id,role_id) FROM sys_role_menu WHERE menu_id IN (1907,1908);"
    Require ($Grants -eq '1907:1:100000,1907:3:100000,1907:4:100000,1907:8:100000,1908:1:100000,1908:3:100000,1908:4:100000') 'Installed commission authorization differs'
    [IO.File]::WriteAllText((Join-Path $Output 'menus-after.tsv'),(Sql 'SELECT * FROM sys_menu ORDER BY menu_id;'),[Text.UTF8Encoding]::new($false))
    [IO.File]::WriteAllText((Join-Path $Output 'grants-after.tsv'),(Sql 'SELECT * FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;'),[Text.UTF8Encoding]::new($false))
}
foreach($Entry in $Originals){Require ((Get-FileHash -LiteralPath $Entry.Path).Hash -eq $Entry.Hash) 'Runtime configuration changed before deployment'}
[pscustomobject]@{Passed=$true;Backend='r150';Frontend='r103';Independent='r5';Preserved=$Originals.Count;SourceSeedHash=$SeedHash;
    MenusApplied=[bool]$Apply;MenuIds=@(1907,1908);NewGrants=7;UnrelatedMenusAndGrantsKept=$true;RuntimeConfigurationModified=$false;
    ProductionModified=$false;RedisWritten=$false;CaptchaConfigurationWritten=$false;CaptchaCounterWritten=$false}|
    ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
"H3_COMMISSION_DEPLOYMENT_PREP: preserved=$($Originals.Count); menus_applied=$Apply; approved_menus=2; approved_grants=7; unrelated_kept=true; redis_written=false"
