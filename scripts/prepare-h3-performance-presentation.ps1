param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "h3-performance-presentation-prep-20261010-$Round"
if(Test-Path -LiteralPath $Output){throw 'Preserve previous presentation evidence'}
$AvailabilityPath=Join-Path $Evidence 'h3-performance-availability-20261010-r2/result.json'
$Availability=Get-Content -LiteralPath $AvailabilityPath -Raw|ConvertFrom-Json
if(-not $Availability.Passed -or $Availability.Frontend -ne 'r98'){throw 'Expected original F98 availability evidence'}
$Ui=[IO.Path]::GetFullPath($Availability.UiDirectory)
if(-not $Ui.StartsWith((Join-Path $Root '.cloudflow-runtime/hr-crm-availability-ui')+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Image directory outside declared evidence'}
$Sources=@($PSCommandPath,$AvailabilityPath,(Join-Path $Ui 'result.json'),
    'cloudflow-frontend/src/pages/hr/HrPerformancePage.tsx',
    'cloudflow-frontend/src/styles/features/admin-performance.css',
    'scripts/verify-crm-performance-availability-ui.mjs',
    'scripts/hr-checks/HrCrmPerformanceAvailabilityCheck.tsx',
    'scripts/run-h3-performance-availability.ps1')
[IO.Directory]::CreateDirectory($Output)|Out-Null
$Originals=@(foreach($Source in $Sources){
    $FullPath=[IO.Path]::GetFullPath($Source,$Root)
    $Copy=Join-Path $Output ('originals/'+[IO.Path]::GetRelativePath($Root,$FullPath))
    [IO.Directory]::CreateDirectory((Split-Path -Parent $Copy))|Out-Null
    $Hash=(Get-FileHash -LiteralPath $FullPath).Hash
    [IO.File]::Copy($FullPath,$Copy,$false)
    if((Get-FileHash -LiteralPath $Copy).Hash -ne $Hash){throw 'Preserved source mismatch'}
    [pscustomobject]@{Path=$FullPath;Hash=$Hash;PreservedAt=$Copy}
})
$Images=@(foreach($Image in Get-ChildItem -LiteralPath $Ui -File -Filter '*.png'){
    $Accepted=$Image.Name -notin @('success-375.png','success-320.png')
    [pscustomobject]@{Path=$Image.FullName;Hash=(Get-FileHash -LiteralPath $Image.FullName).Hash;
        Viewed=$true;Accepted=$Accepted;Finding=if($Accepted){'Dates, status or desktop result readable'}else{'Mobile ranking amounts not fully readable; table geometry requires diagnosis'}}
})
if($Images.Count -ne 8 -or @($Images|Where-Object{-not $_.Accepted}).Count -ne 2){throw 'Unexpected original image set'}
[pscustomobject]@{Frontend='r98';Backend='r146';Originals=$Originals;Images=$Images;
    OriginalAssertionsPassed=$true;VisualAccepted=$false;ProductModified=$false;ProductionModified=$false}|
    ConvertTo-Json -Depth 6|Set-Content -LiteralPath (Join-Path $Output 'manifest.json') -Encoding utf8NoBOM
"H3_PRESENTATION_PREPARATION: sources=$($Originals.Count); images=$($Images.Count); accepted=6; rejected=2; product_modified=false"
