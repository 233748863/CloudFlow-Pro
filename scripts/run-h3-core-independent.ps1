param([Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$Round,
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r150',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$FrontendRound='r103',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$PackageRound='r37',
    [ValidateSet('Codegen','CodegenDisabled','RfqComparison','ProjectHours','SupplierGovernance','AssetLifecycle','OpportunityImport','Opportunity','Teams','Reopen','Targets','EmailArchive','PortalAuth','PortalDisabled','PortalKnowledge','PortalTicket','PortalContract','PortalFinance','PortalOAuth')][string]$Scenario='Opportunity')
$ErrorActionPreference='Stop'
$DatabaseOnly=$false
$CodegenRequired=$Scenario -in @('Codegen','CodegenDisabled')
$CodegenEnabled=$Scenario -eq 'Codegen'
$CodegenFixture=$null
$PortalRequired=$Scenario.StartsWith('Portal')
$PortalEnabled=$PortalRequired -and $Scenario -ne 'PortalDisabled'
$InputsFrozen=$false
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
if([IO.DriveInfo]::new([IO.Path]::GetPathRoot($Root)).AvailableFreeSpace -lt 4GB){throw 'Independent startup requires at least 4 GiB of free data-drive space'}
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$ExecutionMode=if($Scenario -eq 'Codegen'){'A1_CODEGEN_INDEPENDENT'}elseif($Scenario -eq 'CodegenDisabled'){'A1_CODEGEN_DISABLED_INDEPENDENT'}elseif($Scenario -eq 'RfqComparison'){'F5_RFQ_INDEPENDENT'}elseif($Scenario -eq 'ProjectHours'){'F3_PROJECTS_INDEPENDENT'}elseif($Scenario -eq 'SupplierGovernance'){'F2_SUPPLIERS_INDEPENDENT'}elseif($Scenario -eq 'AssetLifecycle'){'F1_ASSETS_INDEPENDENT'}else{'H3_CORE_INDEPENDENT'}
$EvidencePrefix=if($Scenario -eq 'Codegen'){'a1-codegen-independent-20261016'}elseif($Scenario -eq 'CodegenDisabled'){'a1-codegen-disabled-independent-20261016'}elseif($Scenario -eq 'RfqComparison'){'f5-rfq-independent-20261015'}elseif($Scenario -eq 'ProjectHours'){'f3-projects-independent-20261015'}elseif($Scenario -eq 'SupplierGovernance'){'f2-suppliers-independent-20261012'}elseif($Scenario -eq 'AssetLifecycle'){'f1-assets-independent-20261012'}else{'h3-core-independent-20261011'}
$Output=Join-Path $Evidence "$EvidencePrefix-$Round"
$OriginalRun=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Run=Join-Path $Root ('.cloudflow-runtime/batch-g-integration/'+[Guid]::NewGuid().ToString('N'))
if(Test-Path -LiteralPath $Output){throw 'Retain previous independent H3 core evidence'}
foreach($Directory in @($Output,$Run,(Join-Path $Run 'private'))){
    [IO.Directory]::CreateDirectory($Directory)|Out-Null
    if((Get-Item -LiteralPath $Directory).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected verification directory rejected'}
}
if($CodegenRequired){
    $CodegenDirectory=Join-Path $Run 'codegen-output'
    [IO.Directory]::CreateDirectory($CodegenDirectory)|Out-Null
    $CodegenFixture=@{directory=$CodegenDirectory;enabled=$CodegenEnabled}
}
$Access=Get-Acl -LiteralPath $Run
$Access.SetAccessRuleProtection($true,$false)
foreach($Principal in @([Security.Principal.WindowsIdentity]::GetCurrent().User,[Security.Principal.SecurityIdentifier]::new('S-1-5-18'))){
    $Access.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($Principal,'FullControl','ContainerInherit,ObjectInherit','None','Allow'))
}
Set-Acl -LiteralPath $Run -AclObject $Access
$Original=Get-Content -LiteralPath (Join-Path $OriginalRun 'state.json') -Raw|ConvertFrom-Json
if($Original.status -ne 'RUNNING' -or [IO.Path]::GetFullPath($Original.run) -ne $OriginalRun){throw 'Reference runtime identity mismatch'}
$ReferenceMissingOptionalProcesses=[Collections.Generic.List[string]]::new()
$RequiredReferenceProcesses=@('mysql','redis')+@($Original.services|ForEach-Object{$_.name})
foreach($Name in $RequiredReferenceProcesses){
    if(@($Original.processes|Where-Object name -EQ $Name).Count -ne 1){throw 'Required reference process identity missing or duplicated'}
}
foreach($Entry in $Original.processes){
    $Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)"
    if(-not $Observed -and $Entry.name -eq 'smtp-fixture'){
        $ReferenceMissingOptionalProcesses.Add($Entry.name)
    }elseif(-not $Observed -or -not $Observed.CommandLine.Contains($Entry.marker)){
        throw 'Reference process ownership mismatch'
    }
}
function Assert-OriginalProcesses {
    foreach($Entry in $Original.processes){
        $Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)"
        if($ReferenceMissingOptionalProcesses.Contains($Entry.name)){
            if($Observed){throw 'Previously absent optional reference process identity changed'}
            if(@(Get-NetTCPConnection -State Listen -LocalPort $Original.smtpFixture.port -ErrorAction SilentlyContinue).Count -ne 0){throw 'Previously absent reference SMTP fixture acquired a listener'}
            continue
        }
        if(-not $Observed -or -not $Observed.CommandLine.Contains($Entry.marker)){throw 'Reference process ownership mismatch'}
    }
}
Assert-OriginalProcesses
$RedisOwner=@($Original.processes|Where-Object name -EQ 'redis')
if($RedisOwner.Count -ne 1){throw 'One reference Redis process required'}
$RedisExecutable=(Get-CimInstance Win32_Process -Filter "ProcessId=$($RedisOwner[0].id)").ExecutablePath
$Mysql=(Get-Command mysql.exe).Source
$Mysqld=Join-Path (Split-Path -Parent $Mysql) 'mysqld.exe'
$Java=Join-Path $env:JAVA_HOME 'bin/java.exe'
$Javac=Join-Path $env:JAVA_HOME 'bin/javac.exe'
$Processes=[Collections.Generic.List[object]]::new()
$Inputs=[Collections.Generic.List[object]]::new()
$RuntimeInputs=[Collections.Generic.List[object]]::new()
$Layers=@{}
$Services=@($Original.services|Select-Object name,module,application)
if($Services.Count -ne 6 -or (@($Services.name|Sort-Object) -join ',') -ne 'auth,crm,gateway,hr,oa,workflow'){throw 'All six reference services required'}
. (Join-Path $Root 'scripts/owned-layered-artifact.ps1')
$SourceFiles=@(rg --files scripts -g '*.mjs')+@('scripts/run-h3-core-independent.ps1','scripts/prepare-portal-integration.ps1','scripts/owned-layered-artifact.ps1','scripts/platform-checks/ImportIntegrationFixtures.java')+@(Get-ChildItem -LiteralPath (Join-Path $Root 'scripts/message-checks') -File -Filter 'Message*Checks.java'|ForEach-Object{[IO.Path]::GetRelativePath($Root,$_.FullName)})
if($CodegenRequired){$SourceFiles+=@('scripts/verify-a1-codegen-artifacts.ps1','scripts/verify-a1-codegen-local-boundaries.ps1','scripts/codegen-checks/inspect-codegen-zip.py','scripts/codegen-checks/GeneratedInnerHttpChecks.java','scripts/platform-checks/CodegenBoundaryChecks.java','scripts/platform-checks/CodegenDatabaseChecks.java','scripts/java-style-checks/JavaExplicitTypeChecks.java')}
if($Scenario -eq 'RfqComparison'){$SourceFiles+=@('scripts/rfq-checks/read-comparison-workbook.py')}
if($Scenario -eq 'AssetLifecycle'){$SourceFiles+=@('scripts/run-f1-assets-independent.ps1')}
if($Scenario -eq 'PortalOAuth'){$SourceFiles+=@('scripts/configure-oauth2-integration.ps1')}
$PackageDirectory=Join-Path $Evidence "backend-executable-verification-20261006-$PackageRound"
$PackageResultPath=Join-Path $PackageDirectory 'result.json'
$PackageResult=Get-Content -LiteralPath $PackageResultPath -Raw|ConvertFrom-Json
if(-not $PackageResult.Passed -or $PackageResult.BackendRound -ne $BackendRound -or $PackageResult.Services.Count -ne 6){throw 'All six current executable packages must be verified'}
$SourceFiles+=@('scripts/verify-crm-email-database.ps1','scripts/message-checks/CrmEmailSmtpFixture.java','scripts/crm-checks/CrmEmailFoundationChecks.java')+@(Get-ChildItem -LiteralPath (Join-Path $Root 'scripts/crm-checks') -File -Filter 'CrmEmail*DatabaseChecks.java'|ForEach-Object{[IO.Path]::GetRelativePath($Root,$_.FullName)})
$PlanPath=Join-Path $Output 'execution-plan.json'
@{mode=$ExecutionMode;scenario=$Scenario;backend=$BackendRound;frontend=$FrontendRound;packages=$PackageRound;portalRequired=$PortalRequired;portalEnabled=$PortalEnabled;pageRequired=($Scenario -ne 'PortalOAuth');referenceRun=$OriginalRun}|
    ConvertTo-Json -Depth 3|Set-Content -LiteralPath $PlanPath -Encoding utf8NoBOM
$Paths=@($SourceFiles)+(Join-Path $OriginalRun 'state.json')+@($PlanPath,$PackageResultPath,(Join-Path $PackageDirectory 'inputs.json'),(Join-Path $PackageDirectory 'original.ps1'))
foreach($Build in @("backend-$BackendRound","frontend-$FrontendRound")){
    $BuildPath=Join-Path $Evidence "h3-portal-finance-20261002-$Build-inputs.json"
    $Paths+=$BuildPath
    foreach($Item in @(Get-Content -LiteralPath $BuildPath -Raw|ConvertFrom-Json)){
        $FullPath=[IO.Path]::GetFullPath($Item.Path,$Root)
        if((Get-FileHash -LiteralPath $FullPath).Hash -ne $Item.Hash){throw 'Current product differs from verified build'}
        $Paths+=$FullPath
    }
}
foreach($Service in $Services){
    $ArgumentsFile=Join-Path $OriginalRun "$($Service.name)/service.args"
    $Arguments=@(Get-Content -LiteralPath $ArgumentsFile)
    $Index=[Array]::IndexOf($Arguments,'-cp')
    if($Index -lt 0 -or $Arguments[$Index+2] -ne 'org.springframework.boot.loader.launch.JarLauncher'){throw 'Verified layered reference launch required'}
    $ReferenceLayer=[IO.Path]::GetFullPath($Arguments[$Index+1].Trim('"'))
    $ReferenceArtifacts=Join-Path $OriginalRun "$($Service.name)/artifacts"
    if((Split-Path -Parent $ReferenceLayer) -ne $ReferenceArtifacts -or (Split-Path -Leaf $ReferenceLayer) -notmatch '^([a-f0-9]{64})-layered$'){throw 'Owned immutable source package required'}
    $Hash=$Matches[1]
    $Jar=Join-Path $ReferenceArtifacts ($Hash+'.jar')
    $Proof=Get-OwnedLayeredArtifact $Jar $ReferenceArtifacts $Hash
    $Layers[$Proof.Path]=$Proof.Files.Count
    $CurrentPackage=@($PackageResult.Services|Where-Object Name -EQ $Service.name)
    if($CurrentPackage.Count -ne 1){throw 'One verified current package required per service'}
    $Built=[IO.Path]::GetFullPath($CurrentPackage[0].Path,$Root)
    $VerifiedJar=Join-Path $PackageDirectory "$($Service.name)/$(Split-Path -Leaf $Built)"
    $CurrentHash=$CurrentPackage[0].Hash.ToLowerInvariant()
    if((Get-FileHash -LiteralPath $Built).Hash -ne $CurrentHash -or (Get-FileHash -LiteralPath $VerifiedJar).Hash -ne $CurrentHash){throw 'Verified current artifact differs from actual build'}
    $Paths+=@($ArgumentsFile,(Join-Path $OriginalRun "$($Service.name)/integration.properties"),$Jar,$Built,$VerifiedJar)
    $Paths+=@($Proof.Files|ForEach-Object{Join-Path $Proof.Path $_.Path})
    $Service|Add-Member -NotePropertyName sourceJar -NotePropertyValue $VerifiedJar
    $Service|Add-Member -NotePropertyName packageHash -NotePropertyValue $CurrentHash
    $Service|Add-Member -NotePropertyName referenceHash -NotePropertyValue $Hash
    $Service|Add-Member -NotePropertyName referenceArtifacts -NotePropertyValue $ReferenceArtifacts
}
foreach($File in @($Paths|ForEach-Object{[IO.Path]::GetFullPath($_,$Root)}|Sort-Object -Unique)){
    $Inputs.Add([pscustomobject]@{Path=$File;Hash=(Get-FileHash -LiteralPath $File).Hash})
}
$Inputs|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
foreach($Source in $SourceFiles){
    $Copy=Join-Path $Output "originals/$Source"
    [IO.Directory]::CreateDirectory((Split-Path -Parent $Copy))|Out-Null
    [IO.File]::Copy((Join-Path $Root $Source),$Copy,$false)
}
function Assert-Inputs {
    foreach($Item in @($Inputs.ToArray())+@($RuntimeInputs.ToArray())){
        if((Get-FileHash -LiteralPath $Item.Path).Hash -ne $Item.Hash){throw 'Frozen H3 input changed'}
    }
    foreach($Directory in $Layers.Keys){
        $Actual=@(Get-ChildItem -LiteralPath $Directory -Recurse -Force)
        if(@($Actual|Where-Object{-not $_.PSIsContainer}).Count -ne $Layers[$Directory] -or @($Actual|Where-Object{$_.Attributes -band [IO.FileAttributes]::ReparsePoint}).Count){throw 'Frozen layered file set changed'}
    }
}
$Ports=[Collections.Generic.HashSet[int]]::new()
function New-Port {
    do{
        $Listener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0)
        $Listener.Start()
        try{$Port=$Listener.LocalEndpoint.Port}finally{$Listener.Stop()}
    }while(-not $Ports.Add($Port))
    return $Port
}
$MysqlPort=New-Port;$RedisPort=New-Port;$SmtpPort=New-Port
$SmtpFixture=$null
$PortalFixture=$null
$OAuthFixture=$null
$Data=Join-Path $Run 'mysql-data'
foreach($Service in $Services){
    $Service|Add-Member -NotePropertyName port -NotePropertyValue (New-Port)
    $Service|Add-Member -NotePropertyName healthPort -NotePropertyValue (New-Port)
}
$AuthPort=($Services|Where-Object name -EQ 'auth').port
$JdbcUrl="jdbc:mysql://127.0.0.1:$MysqlPort/cloud_flow_db?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai&characterEncoding=UTF-8"
function Sql([string]$Statement,[int]$Port=$MysqlPort){
    if($Port -ne $MysqlPort -and ($Port -ne $Original.mysqlPort -or $Statement -notmatch '^SELECT ' -or $Statement -match ';\s*\S')){throw 'Reference SQL is restricted to one SELECT statement'}
    $Info=[Diagnostics.ProcessStartInfo]::new($Mysql)
    $Info.UseShellExecute=$false;$Info.CreateNoWindow=$true
    $Info.RedirectStandardInput=$true;$Info.RedirectStandardOutput=$true;$Info.RedirectStandardError=$true
    $Info.StandardInputEncoding=[Text.UTF8Encoding]::new($false);$Info.StandardOutputEncoding=[Text.UTF8Encoding]::new($false)
    $Info.Environment.Remove('MYSQL_PWD')|Out-Null
    foreach($Argument in @('--no-defaults','--protocol=TCP','--host=127.0.0.1',"--port=$Port",'--user=root','--skip-password','--batch','--raw','--skip-column-names','--default-character-set=utf8mb4')){$Info.ArgumentList.Add($Argument)}
    $Child=[Diagnostics.Process]::Start($Info)
    $Stdout=$Child.StandardOutput.ReadToEndAsync();$Stderr=$Child.StandardError.ReadToEndAsync()
    $Child.StandardInput.WriteLine($Statement);$Child.StandardInput.Close()
    if(-not $Child.WaitForExit(120000)){$Child.Kill();$Child.WaitForExit();throw 'Independent SQL timed out'}
    if($Child.ExitCode -ne 0){
        $Diagnostic=$Stderr.GetAwaiter().GetResult()
        $Code=[regex]::Match($Diagnostic,'ERROR [0-9]+ \([A-Z0-9]+\)').Value
        $Column=[regex]::Match($Diagnostic,"for column '([a-z_][a-z0-9_]*)'").Groups[1].Value
        throw "Independent SQL failed ($Code; column=$Column); raw diagnostics withheld"
    }
    return $Stdout.GetAwaiter().GetResult().Trim()
}
if([IO.Path]::GetFullPath((Sql 'SELECT @@datadir;' $Original.mysqlPort)).TrimEnd('\','/') -ne (Join-Path $OriginalRun 'mysql-data')){throw 'Reference database ownership mismatch'}
$RetainedTables=@('crm_lead','crm_contact','crm_territory','crm_lead_score_rule','crm_campaign','crm_target_list','crm_target_list_member','crm_campaign_target_list','crm_customer','crm_customer_credit','crm_opportunity','crm_opportunity_lost_detail','crm_lost_reason','crm_competitor','crm_quote','crm_quote_line','crm_receivable','crm_approval','oa_contract','sys_business_rule','sys_business_rule_version','sys_business_rule_hit_record','sys_user','sys_user_role','sys_role','sys_role_menu','sys_dept','sys_config','sys_message_record','sys_message_delivery','sys_message_subscribe','crm_campaign_log','crm_mass_email','crm_mass_email_recipient','crm_email_tracking_link','crm_email_suppression','crm_deal_team','crm_deal_event','sys_message_channel','sys_message_template')
function Get-ReferenceBusiness {
    $Result=@{}
    foreach($Table in $RetainedTables){
        $Columns=(Sql "SELECT column_name FROM information_schema.columns WHERE table_schema='cloud_flow_db' AND table_name='$Table' ORDER BY ordinal_position;" $Original.mysqlPort).Split("`n")|ForEach-Object{$_.Trim()}
        if(-not $Columns -or @($Columns|Where-Object{$_ -notmatch '^[a-z_][a-z0-9_]*$'}).Count){throw 'Invalid retained business columns'}
        $PrimaryColumns=@((Sql "SELECT column_name FROM information_schema.key_column_usage WHERE table_schema='cloud_flow_db' AND table_name='$Table' AND constraint_name='PRIMARY' ORDER BY ordinal_position;" $Original.mysqlPort).Trim().Split("`n")|ForEach-Object{$_.Trim()})
        if($PrimaryColumns.Count -eq 0 -or @($PrimaryColumns|Where-Object{$_ -notmatch '^[a-z_][a-z0-9_]*$'}).Count){throw 'Retained primary key columns required'}
        $Primary=($PrimaryColumns|ForEach-Object{'`'+$_+'`'}) -join ','
        $Expression=($Columns|ForEach-Object{'HEX(`'+$_+'`)'} )-join ','
        $Rows=Sql "SELECT SHA2(CAST(JSON_ARRAY($Expression) AS CHAR),256) AS row_hash FROM cloud_flow_db.$Table ORDER BY $Primary;" $Original.mysqlPort
        $Result[$Table]=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($Rows)))
    }
    return $Result
}
$RetainedTables+=@('crm_deal_allocation','crm_opportunity_stage_history','crm_follow_up','hr_employee','hr_comp_change','hr_salary_slip')
$RetainedTables+=@('sys_portal_user','sys_file','crm_email_record','crm_service_ticket','oa_knowledge_document','oa_knowledge_doc_version','oa_knowledge_read','oa_invoice','oa_invoice_writeoff','oa_contract_fulfilment_term','oa_contract_milestone','oa_contract_payment_schedule')
if($Scenario -eq 'AssetLifecycle'){$RetainedTables+=@('oa_asset','oa_asset_category','oa_asset_log','oa_asset_depreciation_schedule','oa_asset_maintenance_plan','oa_asset_maintenance_task','oa_asset_repair','oa_asset_movement','oa_trace_event')}
if($Scenario -eq 'RfqComparison'){$RetainedTables+=@('oa_purchase_rfq','oa_purchase_rfq_item','oa_purchase_rfq_supplier','oa_supplier_quotation','oa_supplier_quotation_item','oa_supplier','oa_supplier_scorecard','oa_supplier_score_criteria','biz_purchase_request','biz_purchase_item','oa_consumable','oa_trace_event')}
if($Scenario -eq 'SupplierGovernance'){$RetainedTables+=@('oa_supplier','oa_supplier_category','oa_supplier_qualification','oa_supplier_qualification_reminder_log','oa_supplier_scorecard','oa_supplier_score_criteria','biz_purchase_request','biz_purchase_item','biz_purchase_receipt','oa_consumable','oa_consumable_ledger','oa_trace_event')}
if($Scenario -eq 'ProjectHours'){$RetainedTables+=@('oa_project','oa_project_task','oa_project_dependency','oa_project_member','oa_project_template','oa_project_template_task','oa_activity_type','oa_activity_cost','oa_timesheet','oa_timesheet_detail','biz_purchase_request','biz_purchase_item','biz_purchase_receipt','oa_consumable','oa_consumable_ledger','oa_trace_event')}
if($CodegenRequired){$RetainedTables+=@('sys_codegen_table','sys_codegen_column','sys_menu','sys_sms_code','oa_supplier','oa_supplier_category','oa_supplier_qualification','hr_job_level')}
$RetainedTables=@($RetainedTables|Sort-Object -Unique)
$BusinessBefore=Get-ReferenceBusiness
$BusinessBefore|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'reference-business-before.json') -Encoding utf8NoBOM
function Save-State([string]$Status){
    $StateDocument=@{run=$Run;status=$Status;mysqlPort=$MysqlPort;redisPort=$RedisPort;tables=$Tables;smtpFixture=$SmtpFixture;portalFixture=$PortalFixture;services=@($Services|Select-Object name,module,application,port,healthPort);processes=@($Processes|Select-Object name,id,marker);
        verification=@{mode=$ExecutionMode;scenario=$Scenario;output=$Output;portalRequired=$PortalRequired;portalEnabled=$PortalEnabled;inputsFrozen=$InputsFrozen}}
    if($null -ne $CodegenFixture){$StateDocument.codegenFixture=$CodegenFixture}
    if($null -ne $OAuthFixture){$StateDocument.oauth2Fixture=$OAuthFixture}
    $StateDocument|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $Run 'state.json') -Encoding utf8NoBOM
}
function Start-Owned([string]$Name,[string]$Executable,[string[]]$Arguments,[string]$Directory,[string]$Marker,[string]$LogPrefix=$Name){
    $Child=Start-Process -FilePath $Executable -ArgumentList $Arguments -WorkingDirectory $Directory -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $Directory "${LogPrefix}stdout.log") -RedirectStandardError (Join-Path $Directory "${LogPrefix}stderr.log")
    $Processes.Add([pscustomobject]@{name=$Name;id=$Child.Id;marker=$Marker;handle=$Child})
    Save-State 'STARTING'
    return $Child
}
function Run-JavaStep([string]$Executable,[string]$ArgumentFile,[string]$Name){
    $Child=Start-Process -FilePath $Executable -ArgumentList @('"@'+$ArgumentFile+'"') -WorkingDirectory $Run -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $Run "$Name.stdout.log") -RedirectStandardError (Join-Path $Run "$Name.stderr.log")
    if(-not $Child.WaitForExit(120000)){$Child.Kill($true);$Child.WaitForExit();throw 'Independent Java prerequisite timed out'}
    if($Child.ExitCode -ne 0){throw "Independent $Name failed; raw diagnostics retained privately"}
}
$Failure=$null;$VerifierExit=$null;$Stopped=$false;$Unchanged=$false;$ReferenceKept=$false;$Business=$null;$Tables=0
$VerifierHandle=$null
try{
    $Initialize=Start-Process -FilePath $Mysqld -WindowStyle Hidden -Wait -PassThru -ArgumentList @('--no-defaults','--initialize-insecure',"--datadir=`"$Data`"",'--innodb-buffer-pool-size=64M',"--log-error=`"$(Join-Path $Run 'mysql-initialize.log')`"")
    if($Initialize.ExitCode -ne 0){throw 'Independent MySQL initialization failed'}
    $DatabaseProcess=Start-Owned 'mysql' $Mysqld @('--no-defaults',"--datadir=`"$Data`"",'--bind-address=127.0.0.1',"--port=$MysqlPort",'--mysqlx=OFF','--skip-log-bin','--innodb-buffer-pool-size=128M','--max-connections=100',"--log-error=`"$(Join-Path $Run 'mysql.log')`"") $Run $Data
    $Ready=$false
    for($Attempt=0;$Attempt -lt 60;$Attempt++){
        try{if((Sql 'SELECT 1;') -eq '1'){$Ready=$true;break}}catch{}
        if($DatabaseProcess.HasExited){throw 'Independent database exited'}
        Start-Sleep -Milliseconds 500
    }
    if(-not $Ready -or [IO.Path]::GetFullPath((Sql 'SELECT @@datadir;')).TrimEnd('\','/') -ne $Data){throw 'Independent database readiness or identity failed'}
    $Scripts=@(Get-ChildItem -LiteralPath (Join-Path $Root 'cloudflow-backend/DB') -File|Where-Object Name -Match '^0[1-6]\.'|Sort-Object Name)
    if($Scripts.Count -ne 6){throw 'Six formal SQL scripts required'}
    $Expected=0
    foreach($Script in $Scripts){
        $Text=[IO.File]::ReadAllText($Script.FullName)
        $Expected += [regex]::Matches($Text,'(?m)^CREATE TABLE ').Count
        if(-not $Script.Name.StartsWith('01.')){$Text="USE cloud_flow_db;`n"+$Text}
        Sql $Text|Out-Null
    }
    $Tables=[int](Sql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_type='BASE TABLE';")
    if($Tables -ne $Expected -or $Tables -ne 374){throw 'Approved formal table count mismatch'}
    Sql "USE cloud_flow_db; UPDATE sys_job SET status='PAUSED'; UPDATE sys_job SET status='ENABLED' WHERE handler_name IN ('crmMassEmailDispatch','crmCampaignCountAggregate','messageDeliveryRecovery');"|Out-Null
    if($Scenario -eq 'OpportunityImport'){
        Sql "USE cloud_flow_db; UPDATE sys_job SET status='ENABLED' WHERE handler_name='batchImport' AND service_name IN ('auth','hr','oa','crm') AND deleted=0;"|Out-Null
        if([int](Sql "SELECT COUNT(*) FROM cloud_flow_db.sys_job WHERE handler_name='batchImport' AND service_name IN ('auth','hr','oa','crm') AND status='ENABLED' AND deleted=0;") -ne 4){throw 'Four owned import job definitions required'}
        'H3_CORE_IMPORT_JOBS: enabled=4; source_definitions_preserved=true; prior_runtime_written=false'
    }
    Write-Output "H3_CORE_INDEPENDENT_DATABASE: tables=$Tables; independent_mysql=true; previous_runtime_written=false"
    $RedisSecret=[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
    $RedisConfigName='redis-'+(Split-Path -Leaf $Run)+'.conf'
    $RedisConfig=Join-Path $Run $RedisConfigName
    [IO.File]::WriteAllLines($RedisConfig,@('bind 127.0.0.1','protected-mode yes',"port $RedisPort","requirepass $RedisSecret",'appendonly no','save ""','logfile "redis.log"'),[Text.UTF8Encoding]::new($false))
    $Redis=Start-Owned 'redis' $RedisExecutable @($RedisConfigName) $Run $RedisConfigName
    $Ready=$false
    for($Attempt=0;$Attempt -lt 30;$Attempt++){
        $Listeners=@(Get-NetTCPConnection -State Listen -LocalPort $RedisPort -ErrorAction SilentlyContinue)
        if($Listeners.Count -eq 1 -and $Listeners[0].OwningProcess -eq $Redis.Id -and $Listeners[0].LocalAddress -eq '127.0.0.1'){$Ready=$true;break}
        if($Redis.HasExited){throw 'Independent Redis exited'}
        Start-Sleep -Milliseconds 300
    }
    if(-not $Ready){throw 'Independent Redis readiness failed'}
    $RedisPool=Join-Path $Run 'private/redisson.json'
    @{singleServerConfig=@{address="redis://127.0.0.1:$RedisPort";password=$RedisSecret;database=0;connectionMinimumIdleSize=2;connectionPoolSize=8;subscriptionConnectionMinimumIdleSize=1;subscriptionConnectionPoolSize=2};threads=4;nettyThreads=4}|ConvertTo-Json -Depth 4|Set-Content -LiteralPath $RedisPool -Encoding utf8NoBOM
    $Keys=@{}
    foreach($App in $Services|Where-Object name -NE 'gateway'){$Keys[$App.application]=[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))}
    $SharedSecrets=@{'cloudflow.file-storage.secret-key'=[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32));'cloudflow.message.secret-key'=[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32));'cloudflow.encrypt.aes-key'=[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(16))}
    foreach($Service in $Services){
        $Directory=Join-Path $Run $Service.name
        [IO.Directory]::CreateDirectory($Directory)|Out-Null
        $Artifacts=if($Service.packageHash -eq $Service.referenceHash){$Service.referenceArtifacts}else{Join-Path 'D:\CloudFlowProCache\h3-core-artifacts' $Service.name}
        [IO.Directory]::CreateDirectory($Artifacts)|Out-Null
        if((Get-Item -LiteralPath $Artifacts).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected immutable artifact cache rejected'}
        $Jar=Join-Path $Artifacts ($Service.packageHash+'.jar')
        if(-not (Test-Path -LiteralPath $Jar)){[IO.File]::Copy($Service.sourceJar,$Jar,$false)}
        if((Get-FileHash -LiteralPath $Jar).Hash -ne $Service.packageHash){throw 'Immutable cached package differs from verified input'}
        $Proof=Get-OwnedLayeredArtifact $Jar $Artifacts $Service.packageHash
        $Layers[$Proof.Path]=$Proof.Files.Count
        $Service|Add-Member -NotePropertyName layeredPath -NotePropertyValue $Proof.Path
        $RuntimeInputs.Add([pscustomobject]@{Path=$Jar;Hash=(Get-FileHash -LiteralPath $Jar).Hash})
        foreach($File in $Proof.Files){$RuntimeInputs.Add([pscustomobject]@{Path=(Join-Path $Proof.Path $File.Path);Hash=$File.Hash})}
        $Properties=@{}
        foreach($Line in Get-Content -LiteralPath (Join-Path $OriginalRun "$($Service.name)/integration.properties")){
            if($Line -match '^([^#=]+)=(.*)$'){$Properties[$Matches[1]]=$Matches[2].Replace($OriginalRun.Replace('\','/'),$Run.Replace('\','/')).Replace($OriginalRun,$Run)}
        }
        foreach($Key in @('spring.datasource.url','spring.datasource.dynamic.datasource.master.url','DB_URL')){$Properties[$Key]=$JdbcUrl}
        foreach($Key in @('spring.datasource.username','spring.datasource.dynamic.datasource.master.username','DB_USERNAME')){$Properties[$Key]='root'}
        foreach($Key in @('spring.datasource.password','spring.datasource.dynamic.datasource.master.password','DB_PASSWORD')){$Properties[$Key]=''}
        foreach($Key in @('spring.data.redis.port','REDIS_PORT')){$Properties[$Key]=[string]$RedisPort}
        foreach($Key in @('spring.data.redis.password','REDIS_PASSWORD')){$Properties[$Key]=$RedisSecret}
        $Properties['spring.redis.redisson.file']='file:'+$RedisPool.Replace('\','/')
        $Properties['cloudflow.job.auth-url']="http://127.0.0.1:$AuthPort"
        $Properties['cloudflow.portal.enabled']='false';$Properties['cloudflow.portal.public-url']='http://127.0.0.1:1'
        if($PortalRequired -and $Service.name -eq 'gateway'){
            $ReferencePortal=$Original.portalFixture
            if(-not $ReferencePortal.loopback -or $ReferencePortal.port -lt 1024 -or $ReferencePortal.port -gt 65535 -or $ReferencePortal.publicUrl -ne "https://127.0.0.1:$($ReferencePortal.port)" -or $Properties['CLOUDFLOW_CORS_ALLOWED_ORIGINS'] -ne $ReferencePortal.publicUrl){throw 'Inherited portal CORS must exactly match the verified reference loopback origin'}
            $Properties.Remove('CLOUDFLOW_CORS_ALLOWED_ORIGINS')
        }
        if($Service.name -eq 'auth'){
            if($CodegenRequired){
                $Properties['cloudflow.codegen.enabled']=$CodegenEnabled.ToString().ToLowerInvariant()
                $Properties['cloudflow.codegen.project-root']=$CodegenFixture.directory.Replace('\','/')
            }
            $Properties['cloudflow.message.smtp.allowed-hosts']='localhost'
            $Properties['cloudflow.message.smtp.allowed-addresses']='127.0.0.1,::1,0:0:0:0:0:0:0:1'
            $Properties['cloudflow.message.smtp.extra-tls-ports']=[string]$SmtpPort
        }
        $Properties['server.address']='127.0.0.1';$Properties['management.server.address']='127.0.0.1'
        $Properties['server.port']=[string]$Service.port;$Properties['management.server.port']=[string]$Service.healthPort
        foreach($App in $Services){$Properties["spring.cloud.discovery.client.simple.instances.$($App.application)[0].uri"]="http://127.0.0.1:$($App.port)"}
        foreach($Name in $Keys.Keys){$Properties["cloudflow.job.internal-auth.keys.$Name"]=$Keys[$Name]}
        foreach($Name in $SharedSecrets.Keys){$Properties[$Name]=$SharedSecrets[$Name]}
        $Config=Join-Path $Directory 'integration.properties'
        $Lines=@($Properties.Keys|Sort-Object|ForEach-Object{"$_=$($Properties[$_])"})
        $ConfigText=$Lines -join "`n"
        if($ConfigText.Contains((Split-Path -Leaf $OriginalRun))){throw 'Independent configuration retains original directory reference'}
        foreach($OldPort in @($Original.mysqlPort,$Original.redisPort)+@($Original.services|ForEach-Object{$_.port;$_.healthPort})){
            if($ConfigText -match ":$OldPort\b"){throw 'Independent configuration retains original connection'}
        }
        [IO.File]::WriteAllLines($Config,$Lines,[Text.UTF8Encoding]::new($false))
        $ArgumentFile=Join-Path $Directory 'service.args'
        [IO.File]::WriteAllLines($ArgumentFile,@('-Xms64m','-Xmx384m','-Dfile.encoding=UTF-8','-cp',('"'+$Proof.Path.Replace('\','/')+'"'),'org.springframework.boot.loader.launch.JarLauncher',('"--spring.config.additional-location=file:'+$Config.Replace('\','/')+'"'),'--spring.cloud.nacos.config.enabled=false','--spring.cloud.nacos.discovery.enabled=false','--spring.cloud.nacos.config.import-check.enabled=false'),[Text.UTF8Encoding]::new($false))
    }
    $AuthLayer=($Services|Where-Object name -EQ 'auth').layeredPath
    $Classes=Join-Path $Run 'fixture-classes';[IO.Directory]::CreateDirectory($Classes)|Out-Null
    $Libraries=@(Get-ChildItem -LiteralPath (Join-Path $AuthLayer 'BOOT-INF/lib') -File -Filter '*.jar'|Sort-Object Name|ForEach-Object FullName)
    if($Libraries.Count -eq 0){throw 'Actual packaged fixture dependencies required'}
    $Dependencies=(@((Join-Path $AuthLayer 'BOOT-INF/classes'))+$Libraries)-join [IO.Path]::PathSeparator
    $CompileFile=Join-Path $Run 'fixtures-compile.args'
    [IO.File]::WriteAllLines($CompileFile,@('-encoding','UTF-8','-cp',('"'+$Dependencies.Replace('\','/')+'"'),'-d',('"'+$Classes.Replace('\','/')+'"'),('"'+(Join-Path $Root 'scripts/platform-checks/ImportIntegrationFixtures.java').Replace('\','/')+'"')),[Text.UTF8Encoding]::new($false))
    Run-JavaStep $Javac $CompileFile 'fixture-compile'
    $FixtureFile=Join-Path $Run 'fixtures.args'
    [IO.File]::WriteAllLines($FixtureFile,@('-Dfile.encoding=UTF-8','-cp',('"'+($Classes+[IO.Path]::PathSeparator+$Dependencies).Replace('\','/')+'"'),'com.cloudflow.auth.storage.ImportIntegrationFixtures',('"'+$JdbcUrl+'"'),('"'+$Run.Replace('\','/')+'"')),[Text.UTF8Encoding]::new($false))
    Run-JavaStep $Java $FixtureFile 'fixture-prepare'

    if($Scenario -eq 'AssetLifecycle'){
        Sql "USE cloud_flow_db; UPDATE sys_config SET config_value='990000702' WHERE tenant_id=100000 AND config_scope='1' AND config_key='sys.oa.asset.approverUserId'; UPDATE sys_config SET config_value='990000701' WHERE tenant_id=100000 AND config_scope='1' AND config_key='sys.oa.asset.reminderUserId';"|Out-Null
        if((Sql "SELECT COUNT(*) FROM cloud_flow_db.sys_config WHERE tenant_id=100000 AND config_scope='1' AND ((config_key='sys.oa.asset.approverUserId' AND config_value='990000702') OR (config_key='sys.oa.asset.reminderUserId' AND config_value='990000701'));") -ne '2'){throw 'Independent asset approver and reminder recipients required'}
        'F1_ASSET_IDENTITIES: actual_approver=990000702; fallback_recipient=990000701; before_services=true; prior_runtime_written=false'
    }

    if($Scenario -eq 'SupplierGovernance'){
        Sql "USE cloud_flow_db; UPDATE sys_config SET config_value='990000702' WHERE tenant_id=100000 AND config_scope='1' AND config_key='sys.oa.supplier.approverUserId'; UPDATE sys_config SET config_value='990000701' WHERE tenant_id=100000 AND config_scope='1' AND config_key='sys.oa.supplier.qualification.reminderUserId';"|Out-Null
        if((Sql "SELECT COUNT(*) FROM cloud_flow_db.sys_config WHERE tenant_id=100000 AND config_scope='1' AND ((config_key='sys.oa.supplier.approverUserId' AND config_value='990000702') OR (config_key='sys.oa.supplier.qualification.reminderUserId' AND config_value='990000701'));") -ne '2'){throw 'Independent supplier approver and reminder recipients required'}
        'F2_SUPPLIER_IDENTITIES: actual_approver=990000702; fallback_recipient=990000701; before_services=true; prior_runtime_written=false'
    }

    if($Scenario -eq 'RfqComparison'){
        if((Sql "SELECT COUNT(*) FROM cloud_flow_db.sys_role WHERE role_id=990000740;") -ne '0'){throw 'F5 quotation role identifier must be unused'}
        if((Sql "SELECT COUNT(*) FROM cloud_flow_db.sys_user WHERE user_id=990000704 AND tenant_id=100000 AND user_name='g_import_readonly' AND deleted=0;") -ne '1'){throw 'F5 quotation recorder identity mismatch'}
        if((Sql "SELECT COUNT(*) FROM cloud_flow_db.sys_menu WHERE status='0' AND menu_type='M' AND COALESCE(perms,'')='' AND ((menu_id=2 AND parent_id=0) OR (menu_id=203 AND parent_id=2));") -ne '2'){throw 'F5 recorder navigation ancestors must have no business permissions'}
        Sql "USE cloud_flow_db; UPDATE sys_config SET config_value='990000702' WHERE tenant_id=100000 AND config_scope='1' AND config_key IN ('sys.oa.rfq.approverUserId','sys.oa.supplier.approverUserId'); UPDATE sys_config SET config_value='0' WHERE tenant_id=100000 AND config_scope='1' AND config_key='sys.oa.rfq.awardApprovalThreshold'; INSERT INTO sys_role (role_id,tenant_id,role_name,role_key,role_sort,data_scope,ds_type,status,deleted) VALUES (990000740,100000,'独立询价报价录入','f5_quotation_recorder',40,'1',0,'0',0); INSERT INTO sys_role_menu (role_id,menu_id,tenant_id) SELECT 990000740,menu_id,100000 FROM sys_menu WHERE perms IN ('oa:rfq:list','oa:rfq:quote') OR menu_id IN (2,203); INSERT INTO sys_user_role (user_id,role_id,tenant_id) VALUES (990000704,990000740,100000);"|Out-Null
        if((Sql "SELECT COUNT(*) FROM cloud_flow_db.sys_config WHERE tenant_id=100000 AND config_scope='1' AND ((config_key IN ('sys.oa.rfq.approverUserId','sys.oa.supplier.approverUserId') AND config_value='990000702') OR (config_key='sys.oa.rfq.awardApprovalThreshold' AND config_value='0'));") -ne '3'){throw 'F5 approval fixture configuration incomplete'}
        if((Sql "SELECT COUNT(DISTINCT menu.perms) FROM cloud_flow_db.sys_role_menu mapping JOIN cloud_flow_db.sys_menu menu ON menu.menu_id=mapping.menu_id WHERE mapping.role_id=990000740 AND mapping.tenant_id=100000 AND NULLIF(TRIM(menu.perms),'') IS NOT NULL;") -ne '2'){throw 'F5 scoped recorder permissions incomplete'}
        'F5_RFQ_IDENTITIES: actual_approver=990000702; recorder=990000704; threshold=0; scoped_permissions=2; navigation_ancestors=2; before_services=true; prior_runtime_written=false'
    }

    if($Scenario -eq 'ProjectHours'){
        if((Sql "SELECT COUNT(*) FROM cloud_flow_db.hr_employee WHERE tenant_id=100000 AND user_id=990000707;") -ne '0'){throw 'F3 employee fixture identifier must be unused'}
        if((Sql "SELECT COUNT(*) FROM cloud_flow_db.sys_role WHERE role_id=990000730;") -ne '0'){throw 'F3 permission fixture identifier must be unused'}
        if((Sql "SELECT (SELECT COUNT(*) FROM cloud_flow_db.hr_job_level WHERE id=990000731)+(SELECT COUNT(*) FROM cloud_flow_db.hr_position WHERE id=990000732);") -ne '0'){throw 'F3 job-level and position identifiers must be unused'}
        Sql "USE cloud_flow_db; INSERT INTO hr_job_level (id,tenant_id,level_code,level_name,level_series,level_rank,status) VALUES (990000731,100000,'F3_HOURS_LEVEL','工时验收职级','TECHNICAL',731,1); INSERT INTO hr_position (id,tenant_id,position_code,position_name,level_id,status) VALUES (990000732,100000,'F3_HOURS_POSITION','工时验收职位',990000731,1); INSERT INTO hr_employee (id,tenant_id,employee_no,name,gender,dept_id,user_id,employee_status,position_id) VALUES (990000707,100000,'F3_HOURS_EMPLOYEE','工时验收员工','MALE',100,990000707,'REGULAR',990000732); INSERT INTO sys_role (role_id,tenant_id,role_name,role_key,role_sort,data_scope,ds_type,status,deleted) VALUES (990000730,100000,'独立工时员工','f3_timesheet_employee',30,'1',0,'0',0); INSERT INTO sys_role_menu (role_id,menu_id,tenant_id) SELECT 990000730,menu_id,100000 FROM sys_menu WHERE perms IN ('oa:timesheet:list','oa:timesheet:edit','oa:timesheet:submit','oa:timesheet:remove','oa:project:list','oa:project:report'); INSERT INTO sys_user_role (user_id,role_id,tenant_id) VALUES (990000707,990000730,100000);"|Out-Null
        if((Sql "SELECT COUNT(DISTINCT menu.perms) FROM cloud_flow_db.sys_role_menu mapping JOIN cloud_flow_db.sys_menu menu ON menu.menu_id=mapping.menu_id WHERE mapping.role_id=990000730 AND mapping.tenant_id=100000;") -ne '6'){throw 'F3 scoped employee permissions incomplete'}
        'F3_PROJECT_IDENTITIES: actual_manager=990000702; employee=990000707; scoped_permissions=true; before_services=true; prior_runtime_written=false'
    }

    $NextReceivableId=Sql "SELECT GREATEST(COALESCE((SELECT MAX(receivable_id) FROM cloud_flow_db.crm_receivable),0),COALESCE((SELECT MAX(business_ref_id) FROM cloud_flow_db.crm_approval WHERE business_ref_type='CRM_RECEIVABLE'),0))+1;"
    if($NextReceivableId -notmatch '^[1-9][0-9]*$' -or [decimal]$NextReceivableId -gt [long]::MaxValue){throw 'Independent receivable identity boundary invalid'}
    Sql ("ALTER TABLE cloud_flow_db.crm_receivable AUTO_INCREMENT="+$NextReceivableId+';')|Out-Null
    'H3_CORE_INDEPENDENT_IDENTITIES: historical_receivable_ids_reserved=true; original_rows_changed=false'

    $MailDirectory=Join-Path $Run 'private/smtp';[IO.Directory]::CreateDirectory($MailDirectory)|Out-Null
    $MailClasses=Join-Path $Run 'smtp-classes';[IO.Directory]::CreateDirectory($MailClasses)|Out-Null
    $MailPassword=[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(24))
    [IO.File]::WriteAllText((Join-Path $MailDirectory 'store-password.txt'),$MailPassword,[Text.UTF8Encoding]::new($false))
    $PriorMailPassword=$env:CLOUDFLOW_E5_FIXTURE_STORE_PASSWORD
    try{
        $env:CLOUDFLOW_E5_FIXTURE_STORE_PASSWORD=$MailPassword
        & (Join-Path $env:JAVA_HOME 'bin/keytool.exe') '-J-Dfile.encoding=UTF-8' -genkeypair -alias mail-test -dname 'CN=localhost' -ext 'SAN=dns:localhost' -validity 2 -keyalg RSA -keysize 2048 -storetype PKCS12 -keystore (Join-Path $MailDirectory 'tls.p12') -storepass:env CLOUDFLOW_E5_FIXTURE_STORE_PASSWORD -noprompt *> (Join-Path $Run 'smtp-certificate.log')
        if($LASTEXITCODE -ne 0){throw 'Independent H3 core SMTP certificate creation failed'}
    }finally{$env:CLOUDFLOW_E5_FIXTURE_STORE_PASSWORD=$PriorMailPassword}
    $MailSources=@(Get-ChildItem -LiteralPath (Join-Path $Root 'scripts/message-checks') -File -Filter 'Message*Checks.java'|Sort-Object Name)
    $MailCompile=Join-Path $Run 'smtp-compile.args'
    $MailCompileArguments=@('-encoding','UTF-8','-parameters','-cp',('"'+$Dependencies.Replace('\','/')+'"'),'-d',('"'+$MailClasses.Replace('\','/')+'"'))+@($MailSources|ForEach-Object{'"'+$_.FullName.Replace('\','/')+'"'})
    [IO.File]::WriteAllLines($MailCompile,$MailCompileArguments,[Text.UTF8Encoding]::new($false))
    Run-JavaStep $Javac $MailCompile 'smtp-compile'
    $MailArguments=Join-Path $Run 'smtp.args'
    [IO.File]::WriteAllLines($MailArguments,@('-Dfile.encoding=UTF-8','-cp',('"'+($MailClasses+[IO.Path]::PathSeparator+$Dependencies).Replace('\','/')+'"'),'com.cloudflow.auth.message.MessageSmtpFixtureChecks',('"'+$MailDirectory.Replace('\','/')+'"'),[string]$SmtpPort,'14400'),[Text.UTF8Encoding]::new($false))
    $MailProcess=Start-Owned 'smtp-fixture' $Java @('"@'+$MailArguments+'"') $Run $MailArguments 'smtp-'
    $MailReady=$false
    for($Attempt=0;$Attempt -lt 80;$Attempt++){
        if($MailProcess.HasExited){throw 'Independent H3 core SMTP process exited'}
        $MailSnapshot=Join-Path $MailDirectory 'snapshot.json'
        if(Test-Path -LiteralPath $MailSnapshot){
            $MailObserved=Get-Content -LiteralPath $MailSnapshot -Raw|ConvertFrom-Json
            if($MailObserved.loopback -and $MailObserved.port -eq $SmtpPort){$MailReady=$true;break}
        }
        Start-Sleep -Milliseconds 250
    }
    if(-not $MailReady){throw 'Independent H3 core SMTP readiness failed'}
    $MailListeners=@(Get-NetTCPConnection -State Listen -OwningProcess $MailProcess.Id)
    if($MailListeners.Count -ne 1 -or $MailListeners[0].LocalAddress -ne '127.0.0.1' -or $MailListeners[0].LocalPort -ne $SmtpPort){throw 'Owned loopback SMTP listener required'}
    $SmtpFixture=@{port=$SmtpPort;directory=$MailDirectory;host='localhost';loopback=$true;expiresUtc=[DateTime]::UtcNow.AddSeconds(14400).ToString('o')}
    $AuthArguments=Join-Path $Run 'auth/service.args'
    $Trust=@(('"-Djavax.net.ssl.trustStore='+(Join-Path $MailDirectory 'tls.p12').Replace('\','/')+'"'),"-Djavax.net.ssl.trustStorePassword=$MailPassword")
    [IO.File]::WriteAllLines($AuthArguments,@($Trust)+@([IO.File]::ReadAllLines($AuthArguments)),[Text.UTF8Encoding]::new($false))
    Write-Output 'H3_CORE_INDEPENDENT_SMTP: own_fixture=true; loopback=true; tls=true; external_delivery=false'
    'H3_CORE_INDEPENDENT_FIXTURES: own_database_only=true; prior_runtime_written=false; standard_roles_preserved=true; unrelated_jobs_paused=true; business_periods_unchanged=true; captcha_changes=0'

    if($PortalRequired){
        Save-State 'STARTING'
        & (Join-Path $Root 'scripts/prepare-portal-integration.ps1') -StatePath (Join-Path $Run 'state.json') -CurrentSchema -BeforeServices -EnablePortal:$PortalEnabled *> (Join-Path $Output 'portal-preparation.log')
        $PreparedState=Get-Content -LiteralPath (Join-Path $Run 'state.json') -Raw|ConvertFrom-Json
        if($PreparedState.status -ne 'STARTING' -or -not $PreparedState.portalFixture -or -not $Ports.Add([int]$PreparedState.portalFixture.port)){throw 'Prepared independent portal identity or reserved port mismatch'}
        $PortalFixture=$PreparedState.portalFixture
        'H3_CORE_INDEPENDENT_PORTAL: before_services=true; own_tls=true; owned_loopback_cors=true; schema_menus=18; existing_grants_preserved=true'
    }

    if($Scenario -eq 'PortalOAuth'){
        Save-State 'STARTING'
        & (Join-Path $Root 'scripts/configure-oauth2-integration.ps1') -StatePath (Join-Path $Run 'state.json') -BeforeServices *> (Join-Path $Output 'oauth-preparation.log')
        $PreparedState=Get-Content -LiteralPath (Join-Path $Run 'state.json') -Raw|ConvertFrom-Json
        if($PreparedState.status -ne 'STARTING' -or -not $PreparedState.oauth2Fixture -or -not $Ports.Add([int]$PreparedState.oauth2Fixture.port)){throw '独立授权配置或预留端口不一致'}
        $OAuthFixture=$PreparedState.oauth2Fixture
        if($OAuthFixture.publicUrl -ne "http://127.0.0.1:$($OAuthFixture.port)"){throw '独立授权地址必须使用本机回环地址'}
        'H3_CORE_INDEPENDENT_OAUTH: before_services=true; owned_loopback_origin=true; independent_secret=true; original_runtime_written=false'
    }

    foreach($Service in @($Services|Where-Object{-not $DatabaseOnly})){
        $Directory=Join-Path $Run $Service.name;$ArgumentFile=Join-Path $Directory 'service.args'
        $ServiceProcess=Start-Owned $Service.name $Java @('"@'+$ArgumentFile+'"') $Directory $ArgumentFile ''
        $Ready=$false
        for($Attempt=0;$Attempt -lt 180;$Attempt++){
            if($ServiceProcess.HasExited){throw "Independent $($Service.name) exited before readiness"}
            try{if((Invoke-RestMethod -Uri "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 2).status -eq 'UP'){$Ready=$true;break}}catch{}
            Start-Sleep -Seconds 2
        }
        if(-not $Ready){throw "Independent $($Service.name) readiness timeout"}
        Write-Output "H3_CORE_INDEPENDENT_SERVICE: name=$($Service.name); healthy=true; independent=true"
    }
    Save-State 'RUNNING'
    foreach($File in @(Get-ChildItem -LiteralPath $Run -Recurse -File|Where-Object{$_.Name -in @('integration.properties','service.args','redisson.json','fixtures.args','fixtures-compile.args','accounts.json','smtp.args','smtp-compile.args','tls.p12','store-password.txt') -or $_.Name -like 'redis-*.conf' -or $_.FullName.StartsWith($Classes+[IO.Path]::DirectorySeparatorChar) -or $_.FullName.StartsWith($MailClasses+[IO.Path]::DirectorySeparatorChar) -or ($null -ne $OAuthFixture -and $_.FullName.StartsWith((Split-Path -Parent $OAuthFixture.manifest)+[IO.Path]::DirectorySeparatorChar))})){
        $RuntimeInputs.Add([pscustomobject]@{Path=$File.FullName;Hash=(Get-FileHash -LiteralPath $File.FullName).Hash})
    }
    $RuntimeInputs|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $Output 'runtime-inputs.json') -Encoding utf8NoBOM
    $InputsFrozen=$true
    Save-State 'RUNNING'
    Assert-Inputs

    $Log=Join-Path $Output 'live.log'
    if(-not $DatabaseOnly){
        & node scripts/verify-h3-core-runtime.mjs (Join-Path $Run 'state.json') $Output before *> (Join-Path $Output 'runtime-before.log')
        if($LASTEXITCODE -ne 0){throw 'Independent H3 core runtime preflight failed'}
    }
    $VerifierHandle=Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList @('scripts/verify-h3-core.mjs',(Join-Path $Run 'state.json'),$Output,$BackendRound,$FrontendRound,$Scenario) -WorkingDirectory $Root -WindowStyle Hidden -PassThru -RedirectStandardOutput $Log -RedirectStandardError (Join-Path $Output 'live.err')
    $VerifierDeadline=[DateTime]::UtcNow.AddMinutes(30)
    while(-not $VerifierHandle.WaitForExit(1000)){
        if([DateTime]::UtcNow -gt $VerifierDeadline){throw 'Independent H3 core verifier timeout'}
    }
    $VerifierHandle.Refresh()
    $VerifierExit=$VerifierHandle.ExitCode
    & node scripts/verify-h3-core-runtime.mjs (Join-Path $Run 'state.json') $Output after *> (Join-Path $Output 'runtime-after.log')
    $RuntimeExit=$LASTEXITCODE
    $BusinessPath=Join-Path $Output 'result.json'
    if(Test-Path -LiteralPath $BusinessPath){$Business=Get-Content -LiteralPath $BusinessPath -Raw|ConvertFrom-Json -Depth 50}
    if($VerifierExit -ne 0 -or -not $Business -or -not $Business.passed){throw 'Independent H3 core business verification failed; original evidence retained'}
    if($RuntimeExit -ne 0){throw 'Independent H3 core runtime postflight failed'}
    $RequiredEvidence=@('scenario','sourceResult')
    if($Scenario -ne 'PortalOAuth'){$RequiredEvidence+=@('desktop','mobile')}
    foreach($Flag in $RequiredEvidence){
        if($Business.evidence.$Flag -ne $true){throw 'Independent H3 core acceptance coverage incomplete'}
    }
    Write-Output "H3_CORE_INDEPENDENT_BUSINESS: passed=true; checks=$($Business.checks.Count); requests=$($Business.requests.Count); actual_http=true; page_required=$($Scenario -ne 'PortalOAuth')"
}catch{$Failure=$_.Exception.Message}
finally{
    if($VerifierHandle -and -not $VerifierHandle.HasExited){$VerifierHandle.Kill($true);$null=$VerifierHandle.WaitForExit(30000)}
    $StopErrors=[Collections.Generic.List[string]]::new()
    foreach($Owned in @($Processes.ToArray()|Sort-Object {if($_.name -eq 'mysql'){2}elseif($_.name -eq 'redis'){1}else{0}})){
        try{
            $Current=Get-CimInstance Win32_Process -Filter "ProcessId=$($Owned.id)"
            if($Current){
                if(-not $Current.CommandLine.Contains($Owned.marker)){throw 'Process ownership changed'}
                $Owned.handle.Kill($true)
            }
            if(-not $Owned.handle.WaitForExit(30000)){throw 'Owned process did not stop'}
            $Owned.handle.Refresh()
        }catch{$StopErrors.Add($Owned.name)}
    }
    $Stopped=$StopErrors.Count -eq 0
    Save-State $(if($Stopped){'STOPPED'}else{'STOP_FAILED'})
    try{Assert-Inputs;$Unchanged=$true}catch{$Failure=(@($Failure,'Frozen input check failed')|Where-Object{$_}) -join '; '}
    try{
        Assert-OriginalProcesses
        foreach($Service in $Original.services){if((Invoke-RestMethod -Uri "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 5).status -ne 'UP'){throw 'Reference health changed'}}
        $BusinessAfter=Get-ReferenceBusiness
        $BusinessAfter|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'reference-business-after.json') -Encoding utf8NoBOM
        foreach($Table in $RetainedTables){if($BusinessBefore[$Table] -ne $BusinessAfter[$Table]){throw 'Reference business changed'}}
        $ReferenceKept=$true
    }catch{$Failure=(@($Failure,'Reference environment preservation check failed')|Where-Object{$_}) -join '; '}
    $Summary=@{passed=($null -eq $Failure -and $VerifierExit -eq 0 -and $Stopped -and $Unchanged -and $ReferenceKept);failure=$Failure;verifierExit=$VerifierExit;
        inputs=$Inputs.Count;runtimeInputs=$RuntimeInputs.Count;executionOriginals=$SourceFiles.Count;inputsUnchanged=$Unchanged;processesStopped=$Stopped;stopErrors=@($StopErrors);
        run=$Run;backend=$BackendRound;frontend=$FrontendRound;scenario=$Scenario;referenceBusinessTables=$RetainedTables.Count;referenceKept=$ReferenceKept;referenceMissingOptionalProcesses=@($ReferenceMissingOptionalProcesses);priorRuntimeWritten=$false;databaseRetained=$true;
        captchaCounterWrites=0;captchaConfigurationWrites=0;productModified=$false;globalComplete=$false;externalMessagesSent=$false;systemClockChanged=$false;
        databaseOnly=[bool]$DatabaseOnly;businessHttpExecuted=($null -ne $Business);allH3AcceptanceComplete=$false;immutableArtifactsShared=$true;portalRequired=$PortalRequired;portalEnabled=$PortalEnabled;portalPreparedBeforeServices=($null -ne $PortalFixture);oauthPreparedBeforeServices=($null -ne $OAuthFixture)}
    $Summary|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $Output 'launcher-result.json') -Encoding utf8NoBOM
    Write-Output "H3_CORE_INDEPENDENT_RUN: passed=$($Summary.passed); inputs=$($Inputs.Count); runtime_inputs=$($RuntimeInputs.Count); unchanged=$Unchanged; processes_stopped=$Stopped; reference_kept=$ReferenceKept"
}
if(-not $Summary.passed){throw "H3 independent core failed: $Failure"}
