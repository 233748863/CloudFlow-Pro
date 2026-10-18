param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "e4-profile-prep-20261010-$Round"
$Reference=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
if(Test-Path -LiteralPath $Output){throw 'Preserve earlier E4 originals'}
$Inputs=@{}
foreach($Definition in @(@{Kind='backend';Round='r141'},@{Kind='frontend';Round='r91'})){
    $BuildFile=Join-Path $Evidence "h3-portal-finance-20261002-$($Definition.Kind)-$($Definition.Round)-inputs.json"
    foreach($Entry in @(Get-Content -LiteralPath $BuildFile -Raw|ConvertFrom-Json)){
        $Path=[IO.Path]::GetFullPath($Entry.Path,$Root)
        if((Get-FileHash -LiteralPath $Path).Hash -ne $Entry.Hash){throw 'E4 baseline differs from verified product'}
        $Inputs[$Path]=$Entry.Hash
    }
}
$Files=@('cloudflow-backend/cloudflow-service-crm/src/main/java/com/cloudflow/crm/service/impl/CrmLeadScoreEngine.java','cloudflow-frontend/src/components/crm/operations/ProfileFields.tsx','cloudflow-frontend/src/services/api/crm/types.ts','cloudflow-frontend/src/pages/CrmTerritoryPage.tsx','cloudflow-frontend/src/pages/CrmLeadScorePage.tsx','cloudflow-frontend/src/components/crm/operations/LeadActions.tsx','cloudflow-backend/cloudflow-service-crm/src/main/java/com/cloudflow/crm/domain/CrmLead.java','cloudflow-backend/cloudflow-service-crm/src/main/java/com/cloudflow/crm/domain/CrmCustomer.java','cloudflow-frontend/src/router.tsx')
[IO.Directory]::CreateDirectory($Output)|Out-Null
[IO.File]::Copy($PSCommandPath,(Join-Path $Output 'original.ps1'),$false)
$Before=@(foreach($File in $Files){
    $Path=[IO.Path]::GetFullPath($File,$Root)
    if(-not $Path.StartsWith($Root+'\',[StringComparison]::OrdinalIgnoreCase) -or -not $Inputs.ContainsKey($Path)){throw 'E4 product path outside verified baseline'}
    $Copy=Join-Path $Output ('before/'+$File)
    [IO.Directory]::CreateDirectory((Split-Path -Parent $Copy))|Out-Null
    [IO.File]::Copy($Path,$Copy,$false)
    if((Get-FileHash -LiteralPath $Copy).Hash -ne $Inputs[$Path]){throw 'E4 original copy differs'}
    [pscustomobject]@{Path=$Path;Hash=$Inputs[$Path];PreservedAt=$Copy}
})
$Before|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $Output 'before-inputs.json') -Encoding utf8NoBOM
$Private=Join-Path $Output 'before-runtime'
[IO.Directory]::CreateDirectory($Private)|Out-Null
Set-Acl -LiteralPath $Private -AclObject (Get-Acl -LiteralPath $Reference)
$RuntimePaths=@('state.json')+@(foreach($Name in @('auth','hr','oa','crm','workflow','gateway')){"$Name/service.args";"$Name/integration.properties"})
$RuntimeInputs=@(foreach($File in $RuntimePaths){
    $Path=Join-Path $Reference $File;$Copy=Join-Path $Private $File
    [IO.Directory]::CreateDirectory((Split-Path -Parent $Copy))|Out-Null
    $Hash=(Get-FileHash -LiteralPath $Path).Hash
    [IO.File]::Copy($Path,$Copy,$false)
    if((Get-FileHash -LiteralPath $Copy).Hash -ne $Hash){throw 'Original local runtime configuration copy differs'}
    [pscustomobject]@{Path=$Path;Hash=$Hash;PreservedAt=$Copy}
})
$RuntimeInputs|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $Output 'before-runtime-inputs.json') -Encoding utf8NoBOM
@{ProductFiles=$Before.Count;RuntimeFiles=$RuntimeInputs.Count;BaselineBackend='r141';BaselineFrontend='r91';OriginalsPreserved=$true;ProductionModified=$false}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
"E4_PROFILE_PREPARATION: files=$($Before.Count); runtime_configurations=$($RuntimeInputs.Count); baseline_b141_f91=true; product_modified=false"
