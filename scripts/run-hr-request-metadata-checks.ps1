param([Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$Round,
    [Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound)
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "hr-request-metadata-checks-20261009-$Round"
if(Test-Path -LiteralPath $Output){throw 'Preserve prior request metadata verification'}
$Sources=@('scripts/run-hr-request-metadata-checks.ps1','scripts/hr-checks/HrRequestMetadataChecks.java')
$BuildPath=Join-Path $Evidence "h3-portal-finance-20261002-backend-$BackendRound-inputs.json"
$Inputs=@(Get-Content -LiteralPath $BuildPath -Raw|ConvertFrom-Json|ForEach-Object{
    [pscustomobject]@{Path=[IO.Path]::GetFullPath($_.Path,$Root);Hash=$_.Hash}
})
$ClassPathFile=Join-Path $Root 'cloudflow-backend/cloudflow-service-hr/target/report-classpath.txt'
$ClassPathEntries=@((Join-Path $Root 'cloudflow-backend/cloudflow-service-hr/target/classes'))+(Get-Content -LiteralPath $ClassPathFile -Raw).Trim().Split(';')
$Paths=@($ClassPathFile,$BuildPath)+@($Sources|ForEach-Object{Join-Path $Root $_})
foreach($Entry in $ClassPathEntries){
    $Path=[IO.Path]::GetFullPath($Entry)
    if(-not($Path.StartsWith($Root+'\',[StringComparison]::OrdinalIgnoreCase) -or $Path.StartsWith('D:\CloudFlowProCache\',[StringComparison]::OrdinalIgnoreCase))){throw 'Unapproved metadata verification dependency'}
    if(Test-Path -LiteralPath $Path -PathType Container){$Paths+=@(Get-ChildItem -LiteralPath $Path -File -Recurse|ForEach-Object FullName)}else{$Paths+=$Path}
}
$Inputs+=@($Paths|Sort-Object -Unique|ForEach-Object{[pscustomobject]@{Path=$_;Hash=(Get-FileHash -LiteralPath $_).Hash}})
function Assert-Inputs {foreach($Item in $Inputs){if((Get-FileHash -LiteralPath $Item.Path).Hash -ne $Item.Hash){throw 'Metadata verification input changed'}}}
Assert-Inputs
[IO.Directory]::CreateDirectory($Output)|Out-Null
$Inputs|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
foreach($Source in $Sources){[IO.File]::Copy((Join-Path $Root $Source),(Join-Path $Output ('original-'+(Split-Path -Leaf $Source))),$false)}
$ClassPath=$ClassPathEntries -join ';'
$Compile=Join-Path $Output 'compile.args'
[IO.File]::WriteAllLines($Compile,@('-encoding','UTF-8','-proc:none','-classpath',('"'+$ClassPath.Replace('\','/')+'"'),'-d',('"'+$Output.Replace('\','/')+'"'),('"'+(Join-Path $Root $Sources[1]).Replace('\','/')+'"')),[Text.UTF8Encoding]::new($false))
& javac "@$Compile" *> (Join-Path $Output 'compile.log')
if($LASTEXITCODE -ne 0){throw 'Request metadata verification compilation failed'}
$Arguments=Join-Path $Output 'run.args'
[IO.File]::WriteAllLines($Arguments,@('-Xmx256m','-classpath',('"'+($Output+';'+$ClassPath).Replace('\','/')+'"'),'com.cloudflow.hr.checks.HrRequestMetadataChecks'),[Text.UTF8Encoding]::new($false))
& java "@$Arguments" *> (Join-Path $Output 'checks.log')
if($LASTEXITCODE -ne 0){throw 'Request metadata lifecycle verification failed'}
Assert-Inputs
$Marker=Get-Content -LiteralPath (Join-Path $Output 'checks.log') | Where-Object {$_ -match '^HR_REQUEST_METADATA_CHECKS: checks=([0-9]+); passed=true; controller_instances=0; business_calls=0; database_calls=0; external_messages=0$'}
if(@($Marker).Count -ne 1){throw 'Request metadata success evidence missing'}
$Count=[int]([regex]::Match($Marker,'checks=([0-9]+)').Groups[1].Value)
[pscustomobject]@{Passed=$true;BackendRound=$BackendRound;Checks=$Count;Inputs=$Inputs.Count;InputChanges=0;ActualSpringLifecycle=$true;ControllerInstances=0;BusinessCalls=0;DatabaseCalls=0;ExternalMessages=0}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
$Marker
"HR_REQUEST_METADATA_SUMMARY: backend=$BackendRound; inputs=$($Inputs.Count); changed=0; passed=true"
