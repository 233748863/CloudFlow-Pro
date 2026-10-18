param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Reference=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Output=Join-Path $Evidence "h3-performance-deployment-prep-20261010-$Round"
if(Test-Path -LiteralPath $Output){throw 'Retain previous performance deployment preparation'}
$Independent=Join-Path $Evidence 'h3-performance-independent-20261010-r4'
$Launcher=Get-Content -LiteralPath (Join-Path $Independent 'launcher-result.json') -Raw|ConvertFrom-Json
if(-not $Launcher.passed -or -not $Launcher.inputsUnchanged -or -not $Launcher.processesStopped -or -not $Launcher.referenceKept -or
    $Launcher.backend -ne 'r147' -or $Launcher.frontend -ne 'r101'){throw 'Complete current independent verification required'}
$Index=@{}
foreach($Entry in @(Get-Content -LiteralPath (Join-Path $Independent 'inputs.json') -Raw|ConvertFrom-Json)){
    $Index[[IO.Path]::GetFullPath($Entry.Path,$Root)]=$Entry.Hash
}
$Paths=@((Join-Path $Reference 'state.json'))
foreach($Service in @('auth','gateway','oa','crm','workflow','hr')){
    $Paths+=@((Join-Path $Reference "$Service/service.args"),(Join-Path $Reference "$Service/integration.properties"))
}
[IO.Directory]::CreateDirectory($Output)|Out-Null
Set-Acl -LiteralPath $Output -AclObject (Get-Acl -LiteralPath $Reference)
$Originals=@(foreach($Source in $Paths){
    $Source=[IO.Path]::GetFullPath($Source)
    if(-not $Source.StartsWith($Reference+'\',[StringComparison]::OrdinalIgnoreCase) -or
        (Get-Item -LiteralPath $Source).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Owned reference input required'}
    $Hash=(Get-FileHash -LiteralPath $Source).Hash
    if(-not $Index.ContainsKey($Source) -or $Index[$Source] -ne $Hash){throw 'Reference differs from executed R4 inputs'}
    $Copy=Join-Path $Output ('originals/'+[IO.Path]::GetRelativePath($Root,$Source))
    [IO.Directory]::CreateDirectory((Split-Path -Parent $Copy))|Out-Null
    [IO.File]::Copy($Source,$Copy,$false)
    if((Get-FileHash -LiteralPath $Source).Hash -ne $Hash -or (Get-FileHash -LiteralPath $Copy).Hash -ne $Hash){throw 'Reference changed during preservation'}
    [pscustomobject]@{Path=$Source;Hash=$Hash;PreservedAt=$Copy}
})
$Originals|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $Output 'before-inputs.json') -Encoding utf8NoBOM
[IO.File]::Copy($PSCommandPath,(Join-Path $Output 'original.ps1'),$false)
[pscustomobject]@{Passed=$true;Preserved=$Originals.Count;Independent='r4';Backend='r147';Frontend='r101';RuntimeModified=$false;ProductionModified=$false}|
    ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
"H3_PERFORMANCE_DEPLOYMENT_PREP: preserved=$($Originals.Count); reference_inputs_bound=true; runtime_modified=false"
