param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "e5-funnel-visual-prep-20261010-$Round"
if(Test-Path -LiteralPath $Output){throw 'Preserve previous funnel preparation'}
$SourceDirectory=Join-Path $Evidence 'e5-marketing-independent-20261010-r10'
$Launcher=Get-Content -LiteralPath (Join-Path $SourceDirectory 'launcher-result.json') -Raw|ConvertFrom-Json
$Result=Get-Content -LiteralPath (Join-Path $SourceDirectory 'result.json') -Raw|ConvertFrom-Json -Depth 100
if(-not $Launcher.passed -or -not $Launcher.processesStopped -or -not $Launcher.inputsUnchanged -or -not $Launcher.referenceKept -or -not $Result.passed -or $Result.images.Count -ne 12){throw 'Completed original R10 business evidence required'}
$Paths=@('cloudflow-frontend/src/components/crm/operations/OperationsKit.tsx','scripts/runtime-checks/e5-marketing-management.mjs')
$Paths+=@($PSCommandPath,(Join-Path $SourceDirectory 'result.json'),(Join-Path $SourceDirectory 'launcher-result.json'))
[IO.Directory]::CreateDirectory($Output)|Out-Null
$Entries=@(foreach($Relative in $Paths){
    $Path=[IO.Path]::GetFullPath($Relative,$Root)
    if(-not $Path.StartsWith($Root+'\',[StringComparison]::OrdinalIgnoreCase) -or (Get-Item -LiteralPath $Path).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Owned regular preparation input required'}
    $Copy=Join-Path $Output ('originals/'+[IO.Path]::GetRelativePath($Root,$Path))
    [IO.Directory]::CreateDirectory((Split-Path -Parent $Copy))|Out-Null
    $Hash=(Get-FileHash -LiteralPath $Path).Hash
    [IO.File]::Copy($Path,$Copy,$false)
    if((Get-FileHash -LiteralPath $Copy).Hash -ne $Hash){throw 'Preserved funnel source differs'}
    [pscustomobject]@{Path=$Path;Hash=$Hash;PreservedAt=$Copy}
})
$Entries|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $Output 'before-inputs.json') -Encoding utf8NoBOM
foreach($Image in $Result.images){
    $Path=Join-Path $SourceDirectory $Image.name
    if((Get-FileHash -LiteralPath $Path).Hash -ne $Image.hash -or $Image.actuallyViewed -or $Image.visualAccepted){throw 'Original R10 image content or metadata changed'}
}
@{Passed=$true;SourceRound='r10';Backend='r145';Frontend='r96';PlannedFrontend='r97';Inputs=$Entries.Count;OriginalImages=12;ProductModified=$false;BusinessResultPassed=$true;VisualAccepted=$false;Finding='Outside funnel labels clipped at desktop and 320px mobile';OriginalResultChanged=$false}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
'E5_FUNNEL_PREPARATION: passed=true; originals=5; images=12; source_business_passed=true; visual_accepted=false; product_modified=false'

