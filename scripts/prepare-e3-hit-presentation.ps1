param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Source=Join-Path $Evidence 'e3-credit-independent-20261009-r16'
$Output=Join-Path $Evidence "e3-hit-presentation-prep-20261010-$Round"
if(Test-Path -LiteralPath $Output){throw 'Preserve completed E3 presentation diagnosis'}
$Launcher=Get-Content -LiteralPath (Join-Path $Source 'launcher-result.json') -Raw|ConvertFrom-Json
$Business=Get-Content -LiteralPath (Join-Path $Source 'result.json') -Raw|ConvertFrom-Json -Depth 90
$ReviewPath=Join-Path $Source 'image-review.json'
$Review=Get-Content -LiteralPath $ReviewPath -Raw|ConvertFrom-Json -Depth 10
if(-not $Launcher.passed -or $Launcher.verifierExit -ne 0 -or -not $Launcher.inputsUnchanged -or -not $Launcher.processesStopped -or -not $Launcher.referenceKept -or -not $Business.passed -or $Business.checks.Count -ne 740){throw 'Completed successful R16 business evidence required'}
if($Review.visualAccepted -or -not $Review.allActuallyViewed -or $Review.images.Count -ne 17 -or @($Review.images|Where-Object{-not $_.accepted}).Count -ne 2){throw 'Actual R16 visual gaps required'}
foreach($Image in $Review.images){
 if(-not $Image.actuallyViewed -or (Get-FileHash -LiteralPath (Join-Path $Source $Image.name)).Hash -ne $Image.sha256){throw 'Reviewed image differs from original'}
}
$BaselinePath=Join-Path $Evidence 'h3-portal-finance-20261002-frontend-r90-inputs.json'
$Baseline=@{}
foreach($Entry in @(Get-Content -LiteralPath $BaselinePath -Raw|ConvertFrom-Json)){
 $FullPath=[IO.Path]::GetFullPath($Entry.Path,$Root)
 if((Get-FileHash -LiteralPath $FullPath).Hash -ne $Entry.Hash){throw 'Frontend baseline differs from F90'}
 $Baseline[$FullPath]=$Entry.Hash
}
$Files=@('cloudflow-frontend/src/pages/system/BusinessRulePage.tsx','cloudflow-frontend/src/styles/features/admin-business.css','scripts/runtime-checks/e3-credit-pages.mjs')
[IO.Directory]::CreateDirectory($Output)|Out-Null
[IO.File]::Copy($PSCommandPath,(Join-Path $Output 'original.ps1'),$false)
$Before=@(foreach($File in $Files){
 $FullPath=Join-Path $Root $File
 $Hash=(Get-FileHash -LiteralPath $FullPath).Hash
 if($File.StartsWith('cloudflow-frontend/') -and $Hash -ne $Baseline[$FullPath]){throw 'Product original differs from F90'}
 $Copy=Join-Path $Output ('before/'+$File)
 [IO.Directory]::CreateDirectory((Split-Path -Parent $Copy))|Out-Null
 [IO.File]::Copy($FullPath,$Copy,$false)
 if((Get-FileHash -LiteralPath $Copy).Hash -ne $Hash){throw 'Preserved original changed'}
 [pscustomobject]@{Path=$FullPath;Hash=$Hash;PreservedAt=$Copy}
})
$Before|ConvertTo-Json -AsArray -Depth 4|Set-Content -LiteralPath (Join-Path $Output 'before-inputs.json') -Encoding utf8NoBOM
$Paths=@($PSCommandPath,$BaselinePath,$ReviewPath,(Join-Path $Source 'result.json'),(Join-Path $Source 'launcher-result.json'))+@($Before.Path)+@($Review.images|ForEach-Object{Join-Path $Source $_.name})
$Inputs=@($Paths|Sort-Object -Unique|ForEach-Object{[pscustomobject]@{Path=$_;Hash=(Get-FileHash -LiteralPath $_).Hash}})
$Inputs|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
[pscustomobject]@{
 Passed=$true;RuntimeRound='r16';BaselineBackend='r141';BaselineFrontend='r90';BusinessPassed=$true
 ProductFiles=2;VerificationFiles=1;OriginalsPreserved=$true;ImagesViewed=17;ImagesRejected=2
 InputsUnchanged=$true;BusinessWrites=0;RuntimeStarted=$false;ProductModified=$false;ProductionModified=$false
}|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
'E3_HIT_PRESENTATION_PREP: business_passed=true; images_viewed=17; visual_gaps=2; preserved_files=3; frontend=F90; business_writes=0'

