param([ValidateSet('Prepare','Verify')][string]$Phase='Prepare')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence 'e3-parser-source-followup-20261010-r1'
$Failed=Join-Path $Evidence 'h3-portal-finance-adjacent-20261002-r181'
$Files=@('scripts/diagnostic-checks/E3RuleQueryParserInspection.java','scripts/prepare-e3-rule-parser.ps1','scripts/summarize-e3-all-acceptance.ps1')
if($Phase -eq 'Prepare'){
    if(Test-Path -LiteralPath $Output){throw 'Preserve earlier parser-source preparation'}
    $FailureText=Get-Content -LiteralPath (Join-Path $Failed 'sources.log') -Raw
    if(-not $FailureText.Contains('JAVA_SQL_CONCAT: matches=2; rg_exit=0') -or -not $FailureText.Contains('E3RuleQueryParserInspection.java:22:') -or -not $FailureText.Contains('E3RuleQueryParserInspection.java:23:')){throw 'Actual source-constraint failure differs'}
    $FailedInputs=@(Get-Content -LiteralPath (Join-Path $Failed 'inputs.json') -Raw|ConvertFrom-Json)
    foreach($Entry in $FailedInputs){
        $Path=[IO.Path]::GetFullPath($Entry.Path,$Root)
        if((Get-FileHash -LiteralPath $Path).Hash -ne $Entry.Hash){throw 'Failed adjacent input changed before preservation'}
    }
    [IO.Directory]::CreateDirectory($Output)|Out-Null
    [IO.File]::Copy($PSCommandPath,(Join-Path $Output 'original.ps1'),$false)
    [IO.File]::Copy((Join-Path $Root 'scripts/run-portal-finance-adjacent.ps1'),(Join-Path $Output 'adjacent-original.ps1'),$false)
    $Before=@(foreach($File in $Files){
        $Path=Join-Path $Root $File
        $Copy=Join-Path $Output ('before/'+$File)
        [IO.Directory]::CreateDirectory((Split-Path -Parent $Copy))|Out-Null
        $Hash=(Get-FileHash -LiteralPath $Path).Hash
        [IO.File]::Copy($Path,$Copy,$false)
        if((Get-FileHash -LiteralPath $Copy).Hash -ne $Hash){throw 'Diagnostic source copy differs'}
        [pscustomobject]@{Path=$Path;Hash=$Hash;PreservedAt=$Copy}
    })
    $Before|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $Output 'before-inputs.json') -Encoding utf8NoBOM
    @{Prepared=$true;OriginalFiles=$Before.Count;FailedAdjacent='r181';FailedInputs=$FailedInputs.Count;FailedInputsUnchanged=$true;ProductModified=$false}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'preparation.json') -Encoding utf8NoBOM
    'E3_PARSER_SOURCE_PREPARATION: originals=3; failed_inputs_unchanged=true; product_modified=false'
    return
}
if(-not (Test-Path -LiteralPath (Join-Path $Output 'preparation.json')) -or (Test-Path -LiteralPath (Join-Path $Output 'result.json'))){throw 'Fresh prepared parser verification required'}
$Reference=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Arguments=@(Get-Content -LiteralPath (Join-Path $Reference 'auth/service.args'))
$ClasspathIndex=[Array]::IndexOf($Arguments,'-cp')
if($ClasspathIndex -lt 0){throw 'Actual reference classpath required'}
$Layer=$Arguments[$ClasspathIndex+1].Trim('"')
$Parser=Join-Path $Layer 'BOOT-INF/lib/jsqlparser-4.9.jar'
$Pagination=@(Get-ChildItem -LiteralPath (Join-Path $Layer 'BOOT-INF/lib') -File -Filter 'mybatis-plus-extension-*.jar')
if($Pagination.Count -ne 1 -or -not (Test-Path -LiteralPath $Parser)){throw 'Actual runtime parser and pagination required'}
$Mapper=Join-Path $Evidence 'e3-rule-parser-prep-20261010-r1/before/cloudflow-backend/cloudflow-auth/src/main/resources/mapper/BusinessRuleHitRecordMapper.xml'
$JavaSource=Join-Path $Root $Files[0]
$Paths=@($PSCommandPath,$JavaSource,(Join-Path $Root $Files[1]),$Mapper,$Parser,$Pagination[0].FullName,(Join-Path $Output 'before-inputs.json'),(Join-Path $Output 'preparation.json'),(Join-Path $Failed 'sources.log'),(Join-Path $Failed 'inputs.json'))
$Inputs=@($Paths|ForEach-Object{[pscustomobject]@{Path=$_;Hash=(Get-FileHash -LiteralPath $_).Hash}})
$Inputs|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
[IO.File]::Copy($JavaSource,(Join-Path $Output 'verified.java'),$false)
$Classpath=@($Parser,$Pagination[0].FullName) -join [IO.Path]::PathSeparator
& java --class-path $Classpath $JavaSource $Mapper (Join-Path $Output 'parser-result.json') *> (Join-Path $Output 'parser.log')
$ParserExit=$LASTEXITCODE
Get-Content -LiteralPath (Join-Path $Output 'parser.log')|Where-Object{$_ -match '^E3_RULE_PARSER_INSPECTION:'}
if($ParserExit -ne 0){throw 'Actual parser followup failed; original output retained'}
$Checks=Get-Content -LiteralPath (Join-Path $Output 'parser-result.json') -Raw|ConvertFrom-Json
if($Checks.originalParsed -or $Checks.originalCountParsed -or -not $Checks.compatibleParsed -or -not $Checks.compatibleCountParsed -or -not $Checks.actualMapperSource -or -not $Checks.productionParser -or $Checks.databaseWrites -ne 0){throw 'Parser checks were weakened or changed'}
foreach($Entry in $Inputs){if((Get-FileHash -LiteralPath $Entry.Path).Hash -ne $Entry.Hash){throw 'Parser followup input changed'}}
foreach($Entry in @(Get-Content -LiteralPath (Join-Path $Output 'before-inputs.json') -Raw|ConvertFrom-Json)){if((Get-FileHash -LiteralPath $Entry.PreservedAt).Hash -ne $Entry.Hash){throw 'Failed source original changed'}}
@{Passed=$true;FailedAdjacent='r181';OriginalTerminal='a6ce6e';OriginalExit=1;Inputs=$Inputs.Count;InputsUnchanged=$true;OriginalsPreserved=$true;ParserChecksRetained=$true;ActualPaginationGenerator=$true;ProductModified=$false;DatabaseWrites=0;RuntimeStarted=$false}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
'E3_PARSER_SOURCE_FOLLOWUP: passed=true; actual_pagination=true; original_checks_retained=true; database_writes=0'
