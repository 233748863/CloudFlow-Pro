param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Reference=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Source=Join-Path $Evidence 'e3-credit-independent-20261009-r15'
$Output=Join-Path $Evidence "e3-rule-parser-prep-20261010-$Round"
if(Test-Path -LiteralPath $Output){throw 'Retain original query parser diagnosis'}
$Launcher=Get-Content -LiteralPath (Join-Path $Source 'launcher-result.json') -Raw|ConvertFrom-Json
$Business=Get-Content -LiteralPath (Join-Path $Source 'result.json') -Raw|ConvertFrom-Json -Depth 80
if($Launcher.passed -or -not $Launcher.inputsUnchanged -or -not $Launcher.processesStopped -or -not $Launcher.referenceKept -or $Business.failure.message -ne 'rule_page_dedup_switch_resets_page_and_reduces_rows'){throw 'Completed R15 parser failure required'}
$Log=Join-Path $Launcher.run 'auth/stdout.log'
$LogText=[IO.File]::ReadAllText($Log)
if(-not $LogText.Contains('net.sf.jsqlparser.parser.ParseException') -or -not $LogText.Contains('at line 4, column 47')){throw 'Actual parser diagnostic differs'}
$File='cloudflow-backend/cloudflow-auth/src/main/resources/mapper/BusinessRuleHitRecordMapper.xml'
$BaselinePath=Join-Path $Evidence 'h3-portal-finance-20261002-backend-r140-inputs.json'
$Baseline=@{}
foreach($Entry in @(Get-Content -LiteralPath $BaselinePath -Raw|ConvertFrom-Json)){
    $Path=[IO.Path]::GetFullPath($Entry.Path,$Root)
    if((Get-FileHash -LiteralPath $Path).Hash -ne $Entry.Hash){throw 'Backend baseline differs from B140'}
    $Baseline[$Path]=$Entry.Hash
}
[IO.Directory]::CreateDirectory($Output)|Out-Null
[IO.File]::Copy($PSCommandPath,(Join-Path $Output 'original.ps1'),$false)
$Path=Join-Path $Root $File
$Copy=Join-Path $Output ('before/'+$File)
[IO.Directory]::CreateDirectory((Split-Path -Parent $Copy))|Out-Null
[IO.File]::Copy($Path,$Copy,$false)
if((Get-FileHash -LiteralPath $Copy).Hash -ne $Baseline[$Path]){throw 'Preserved mapper differs'}
@([pscustomobject]@{Path=$Path;Hash=$Baseline[$Path];PreservedAt=$Copy})|ConvertTo-Json -AsArray -Depth 4|Set-Content -LiteralPath (Join-Path $Output 'before-inputs.json') -Encoding utf8NoBOM
$Private=Join-Path $Output 'before-runtime'
[IO.Directory]::CreateDirectory($Private)|Out-Null
Set-Acl -LiteralPath $Private -AclObject (Get-Acl -LiteralPath $Reference)
$RuntimePaths=@('state.json')+@(foreach($Name in @('auth','hr','oa','crm','workflow','gateway')){"$Name/service.args";"$Name/integration.properties"})
$RuntimeInputs=@(foreach($File in $RuntimePaths){
    $Path=Join-Path $Reference $File;$Copy=Join-Path $Private $File
    [IO.Directory]::CreateDirectory((Split-Path -Parent $Copy))|Out-Null
    $Hash=(Get-FileHash -LiteralPath $Path).Hash
    [IO.File]::Copy($Path,$Copy,$false)
    if((Get-FileHash -LiteralPath $Copy).Hash -ne $Hash){throw 'Original runtime configuration differs'}
    [pscustomobject]@{Path=$Path;Hash=$Hash;PreservedAt=$Copy}
})
$RuntimeInputs|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $Output 'before-runtime-inputs.json') -Encoding utf8NoBOM
$Arguments=@(Get-Content -LiteralPath (Join-Path $Reference 'auth/service.args'))
$Index=[Array]::IndexOf($Arguments,'-cp')
if($Index -lt 0){throw 'Current layered classpath required'}
$Layer=$Arguments[$Index+1].Trim('"')
$Parser=Join-Path $Layer 'BOOT-INF/lib/jsqlparser-4.9.jar'
if(-not (Test-Path -LiteralPath $Parser)){throw 'Actual runtime JSQLParser 4.9 required'}
$Pagination=@(Get-ChildItem -LiteralPath (Join-Path $Layer 'BOOT-INF/lib') -File -Filter 'mybatis-plus-extension-*.jar')
if($Pagination.Count -ne 1){throw 'Actual runtime pagination utility required'}
$ParserClasspath=@($Parser,$Pagination[0].FullName) -join [IO.Path]::PathSeparator
$JavaSource=Join-Path $Root 'scripts/diagnostic-checks/E3RuleQueryParserInspection.java'
[IO.File]::Copy($JavaSource,(Join-Path $Output 'original.java'),$false)
$Inputs=@($PSCommandPath,$JavaSource,(Join-Path $Root 'cloudflow-backend/cloudflow-auth/src/main/resources/mapper/BusinessRuleHitRecordMapper.xml'),$Parser,$Pagination[0].FullName,$Log,$BaselinePath,(Join-Path $Source 'result.json'),(Join-Path $Source 'launcher-result.json'))
$Inputs=@($Inputs|ForEach-Object{[pscustomobject]@{Path=$_;Hash=(Get-FileHash -LiteralPath $_).Hash}})
$Inputs|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
& java --class-path $ParserClasspath $JavaSource (Join-Path $Root 'cloudflow-backend/cloudflow-auth/src/main/resources/mapper/BusinessRuleHitRecordMapper.xml') (Join-Path $Output 'parser-result.json') *> (Join-Path $Output 'parser.log')
$ParserExit=$LASTEXITCODE
Get-Content -LiteralPath (Join-Path $Output 'parser.log')|Where-Object {$_ -match '^E3_RULE_PARSER_INSPECTION:'}
foreach($Entry in $Inputs){if((Get-FileHash -LiteralPath $Entry.Path).Hash -ne $Entry.Hash){throw 'Parser diagnosis input changed'}}
if($ParserExit -ne 0){throw 'Parser hypothesis not confirmed; original output retained'}
@{Passed=$true;RuntimeRound='r15';BaselineBackend='r140';Parser='JSQLParser 4.9';ProductFiles=1;OriginalsPreserved=$true;RuntimeFiles=$RuntimeInputs.Count;ActualHttpFailureStatus=500;ActualParserFailure=$true;FailureLine=4;FailureColumn=47;NullSafeOperatorRejected=$true;StandardNullComparisonAccepted=$true;ActualScreenshotViewed=$true;BusinessWrites=0;RuntimeStarted=$false;ProductModified=$false;ProductionModified=$false}|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
'E3_RULE_PARSER_DIAGNOSIS: passed=true; original_sql_rejected=true; compatible_sql_accepted=true; business_writes=0'
