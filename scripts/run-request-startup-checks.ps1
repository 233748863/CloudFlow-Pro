param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound)
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "request-startup-checks-20261009-$Round"
if(Test-Path -LiteralPath $Output){throw 'Retain previous startup verification'}
$BuildPath=Join-Path $Evidence "h3-portal-finance-20261002-backend-$BackendRound-inputs.json"
$Product=@(Get-Content -LiteralPath $BuildPath -Raw|ConvertFrom-Json)
$Sources=@('scripts/platform-checks/RequestStartupChecks.java','scripts/platform-checks/HolidayCalendarChecks.java','scripts/platform-checks/HolidayRedisFixture.java')
$Files=@($Sources)+@('scripts/run-request-startup-checks.ps1',$BuildPath)
$ClassPathFile=Join-Path $Root 'cloudflow-backend/cloudflow-auth/target/im-classpath.txt'
$ClassPathEntries=@((Join-Path $Root 'cloudflow-backend/cloudflow-auth/target/classes'))+(Get-Content -LiteralPath $ClassPathFile -Raw).Trim().Split(';')
$Files+=$ClassPathFile
foreach($Entry in $ClassPathEntries){
    $Path=[IO.Path]::GetFullPath($Entry)
    if(-not ($Path.StartsWith($Root+'\',[StringComparison]::OrdinalIgnoreCase) -or $Path.StartsWith('D:\CloudFlowProCache\',[StringComparison]::OrdinalIgnoreCase))){throw 'Unapproved startup dependency path'}
    if(Test-Path -LiteralPath $Path -PathType Container){$Files+=@(Get-ChildItem -LiteralPath $Path -Recurse -File|ForEach-Object FullName)}else{$Files+=$Path}
}
$Inputs=@($Product|ForEach-Object{[pscustomobject]@{Path=[IO.Path]::GetFullPath($_.Path,$Root);Hash=$_.Hash}})
$Inputs+=@($Files|ForEach-Object{[IO.Path]::GetFullPath($_,$Root)}|Sort-Object -Unique|ForEach-Object{[pscustomobject]@{Path=$_;Hash=(Get-FileHash -LiteralPath $_).Hash}})
function Assert-Inputs {foreach($Item in $Inputs){if((Get-FileHash -LiteralPath $Item.Path).Hash -ne $Item.Hash){throw 'Startup verification input changed'}}}
Assert-Inputs
[IO.Directory]::CreateDirectory($Output)|Out-Null
$Inputs|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
foreach($Source in @($Sources)+@('scripts/run-request-startup-checks.ps1')){[IO.File]::Copy((Join-Path $Root $Source),(Join-Path $Output ('original-'+(Split-Path -Leaf $Source))),$false)}
$ClassPath=$ClassPathEntries -join ';'
$Compile=Join-Path $Output 'compile.args'
[IO.File]::WriteAllLines($Compile,@('-encoding','UTF-8','-proc:none','-classpath',('"'+$ClassPath.Replace('\','/')+'"'),'-d',('"'+$Output.Replace('\','/')+'"'))+@($Sources|ForEach-Object{'"'+(Join-Path $Root $_).Replace('\','/')+'"'}),[Text.UTF8Encoding]::new($false))
& javac "@$Compile" *> (Join-Path $Output 'compile.log')
if($LASTEXITCODE -ne 0){throw 'Startup verification compilation failed; original retained'}
$Counts=@{}
foreach($Test in @('com.cloudflow.startup.checks.RequestStartupChecks','com.cloudflow.common.holiday.service.HolidayCalendarChecks')){
    $Name=$Test.Split('.')[-1]
    $Arguments=Join-Path $Output ($Name+'.args')
    [IO.File]::WriteAllLines($Arguments,@('-Xmx256m','-classpath',('"'+($Output+';'+$ClassPath).Replace('\','/')+'"'),$Test),[Text.UTF8Encoding]::new($false))
    & java "@$Arguments" *> (Join-Path $Output ($Name+'.log'))
    if($LASTEXITCODE -ne 0){throw 'Startup behavior verification failed; original retained'}
    $Log=Get-Content -LiteralPath (Join-Path $Output ($Name+'.log')) -Raw
    $Pattern=if($Name -eq 'RequestStartupChecks'){'REQUEST_STARTUP_CHECKS: checks=(\d+);'}else{'HOLIDAY_CALENDAR_CHECKS: assertions=(\d+); passed=\d+; failed=0;'}
    $Match=[regex]::Match($Log,$Pattern)
    if(-not $Match.Success){throw 'Startup verification success marker missing'}
    $Counts[$Name]=[int]$Match.Groups[1].Value
    Get-Content -LiteralPath (Join-Path $Output ($Name+'.log'))|Where-Object {$_ -match '^(REQUEST_STARTUP_CHECKS:|HOLIDAY_CALENDAR_CHECKS:)'}
}
Assert-Inputs
[pscustomobject]@{Passed=$true;BackendRound=$BackendRound;Inputs=$Inputs.Count;InputChanges=0;OriginalScripts=4;Checks=$Counts;ActualSpringLifecycle=$true;ControlledMapperFailures=$true;RealDatabase=$false;BusinessRequests=0;ExternalMessages=0;ProductionModified=$false}|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
"REQUEST_STARTUP_SUMMARY: inputs=$($Inputs.Count); changed=0; scripts=4; backend=$BackendRound; business_requests=0; exit=0"
