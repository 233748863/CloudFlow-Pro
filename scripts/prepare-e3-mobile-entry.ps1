param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Source=Join-Path $Evidence 'e3-credit-independent-20261009-r14'
$Output=Join-Path $Evidence "e3-mobile-entry-prep-20261010-$Round"
if(Test-Path -LiteralPath $Output){throw 'Preserve original mobile entry diagnosis'}
$Launcher=Get-Content -LiteralPath (Join-Path $Source 'launcher-result.json') -Raw|ConvertFrom-Json
$Business=Get-Content -LiteralPath (Join-Path $Source 'result.json') -Raw|ConvertFrom-Json -Depth 80
if($Launcher.passed -or -not $Launcher.inputsUnchanged -or -not $Launcher.processesStopped -or -not $Launcher.referenceKept -or $Business.failure.phase -ne 'desktop_mobile_and_warning_pages' -or -not $Business.failure.message.Contains('分析视图')){throw 'Actual completed R14 mobile refresh failure required'}
$File='cloudflow-frontend/src/router.tsx'
$BaselinePath=Join-Path $Evidence 'h3-portal-finance-20261002-frontend-r89-inputs.json'
$Baseline=@{}
foreach($Entry in @(Get-Content -LiteralPath $BaselinePath -Raw|ConvertFrom-Json)){
    $Path=[IO.Path]::GetFullPath($Entry.Path,$Root)
    if((Get-FileHash -LiteralPath $Path).Hash -ne $Entry.Hash){throw 'Frontend baseline differs from F89'}
    $Baseline[$Path]=$Entry.Hash
}
$RouterPath=Join-Path $Root $File
$Router=Get-Content -LiteralPath $RouterPath -Raw
$Mobile=$Router.Substring($Router.IndexOf('const mobileRoutes ='))
$Routes=@('/office/crm','/office/crm/lost-analysis','/office/crm/credit','/system/rules')
foreach($Route in $Routes){if($Mobile.Contains("path: '$Route'")){throw 'Expected mobile route is already present'}}
if(-not $Mobile.Contains('此功能暂不支持移动端，请在电脑访问。')){throw 'Actual mobile fallback differs'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
[IO.File]::Copy($PSCommandPath,(Join-Path $Output 'original.ps1'),$false)
$Copy=Join-Path $Output ('before/'+$File)
[IO.Directory]::CreateDirectory((Split-Path -Parent $Copy))|Out-Null
[IO.File]::Copy($RouterPath,$Copy,$false)
if((Get-FileHash -LiteralPath $Copy).Hash -ne $Baseline[$RouterPath]){throw 'Preserved router differs from F89'}
@([pscustomobject]@{Path=$RouterPath;Hash=$Baseline[$RouterPath];PreservedAt=$Copy})|ConvertTo-Json -AsArray -Depth 4|Set-Content -LiteralPath (Join-Path $Output 'before-inputs.json') -Encoding utf8NoBOM
$Inputs=@($PSCommandPath,$RouterPath,$BaselinePath,(Join-Path $Source 'result.json'),(Join-Path $Source 'launcher-result.json'),(Join-Path $Source 'e3-failure-manager.png'))
$Inputs=@($Inputs|ForEach-Object{[pscustomobject]@{Path=$_;Hash=(Get-FileHash -LiteralPath $_).Hash}})
$Inputs|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
$Result=[pscustomobject]@{
    RuntimeRound='r14';BaselineFrontend='r89';ProductFiles=1;OriginalsPreserved=$true
    MissingMobileRoutes=$Routes;FailureAfterActualMobileReload=$true
    ScreenshotActuallyViewed=$true;FailureScreenshot=(Join-Path $Source 'e3-failure-manager.png')
    InputsUnchanged=$true;BusinessWrites=0;RuntimeStarted=$false;ProductModified=$false;ProductionModified=$false
}
$Result|ConvertTo-Json -Depth 6|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
'E3_MOBILE_ENTRY_DIAGNOSIS: missing_routes=4; preserved_product_files=1; frontend=F89; business_writes=0'
