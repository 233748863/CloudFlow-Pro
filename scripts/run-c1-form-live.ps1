param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round,
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound,
    [ValidatePattern('^r[1-9][0-9]*$')][string]$FrontendRound,
    [switch]$ErrorPages,
    [switch]$ValueBoundaries,
    [switch]$ValuePages,
    [switch]$DictionaryPages,
    [switch]$LayoutPages,
    [switch]$OriginalPages,
    [switch]$HistoricalReferences,
    [switch]$DesignerOperations,
    [switch]$SubtableMobile,
    [switch]$SubtableNative,
    [switch]$SubtableTypes,
    [switch]$SubtableDesigner,
    [switch]$SubtablePrecision,
    [switch]$PermissionPages,
    [switch]$ExpressionPages,
    [switch]$PermissionCache,
    [switch]$MatrixTemplates,
    [switch]$ReadEntries,
    [switch]$PermissionRaces,
    [switch]$OauthResources,
    [switch]$LinkedReads,
    [switch]$ActionReturns,
    [switch]$VersionRecords)
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "c1-form-live-20261005-$Round"
if(Test-Path -LiteralPath $Output){throw 'Retain earlier live form evidence'}
[IO.Directory]::CreateDirectory($Output) | Out-Null
$Inputs=@()
foreach($Build in @("backend-$BackendRound","frontend-$FrontendRound")){
    $Inputs+=@(Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-20261002-$Build-inputs.json") -Raw|ConvertFrom-Json)
}
foreach($File in @('scripts/run-c1-form-live.ps1','scripts/verify-batch-c-live.mjs','scripts/runtime-checks/form-browser-auth.mjs','scripts/runtime-checks/FormLivePasswordHash.java','scripts/run-owned-captcha-allowance.mjs','scripts/owned-gateway-redis.mjs','scripts/verify-c1-error-pages.mjs','scripts/b2-mobile-browser.mjs','scripts/verify-c1-value-boundaries.mjs','scripts/verify-c1-value-pages.mjs','scripts/cleanup-c1-error-page-roles.mjs')){
    $Inputs+=[pscustomobject]@{Path=$File;Hash=(Get-FileHash -LiteralPath (Join-Path $Root $File)).Hash}
}
function Assert-Inputs {
    foreach($Item in $Inputs){if((Get-FileHash -LiteralPath (Join-Path $Root $Item.Path)).Hash -ne $Item.Hash){throw 'Form live input changed'}}
}
$Inputs += [pscustomobject]@{Path='scripts/verify-c1-dictionary-pages.mjs';Hash=(Get-FileHash -LiteralPath (Join-Path $Root 'scripts/verify-c1-dictionary-pages.mjs')).Hash}
$Inputs += [pscustomobject]@{Path='scripts/verify-c1-layout-pages.mjs';Hash=(Get-FileHash -LiteralPath (Join-Path $Root 'scripts/verify-c1-layout-pages.mjs')).Hash}
$Inputs += [pscustomobject]@{Path='scripts/verify-c1-original-pages.mjs';Hash=(Get-FileHash -LiteralPath (Join-Path $Root 'scripts/verify-c1-original-pages.mjs')).Hash}
$Inputs += [pscustomobject]@{Path='scripts/verify-c1-historical-references.mjs';Hash=(Get-FileHash -LiteralPath (Join-Path $Root 'scripts/verify-c1-historical-references.mjs')).Hash}
$Inputs += [pscustomobject]@{Path='scripts/verify-c1-designer-operations.mjs';Hash=(Get-FileHash -LiteralPath (Join-Path $Root 'scripts/verify-c1-designer-operations.mjs')).Hash}
$Inputs += [pscustomobject]@{Path='scripts/verify-c2-mobile-subtable-pages.mjs';Hash=(Get-FileHash -LiteralPath (Join-Path $Root 'scripts/verify-c2-mobile-subtable-pages.mjs')).Hash}
$Inputs += [pscustomobject]@{Path='scripts/verify-c2-type-pages.mjs';Hash=(Get-FileHash -LiteralPath (Join-Path $Root 'scripts/verify-c2-type-pages.mjs')).Hash}
$Inputs += [pscustomobject]@{Path='scripts/verify-c2-designer-pages.mjs';Hash=(Get-FileHash -LiteralPath (Join-Path $Root 'scripts/verify-c2-designer-pages.mjs')).Hash}
$Inputs += [pscustomobject]@{Path='scripts/verify-c2-precision-pages.mjs';Hash=(Get-FileHash -LiteralPath (Join-Path $Root 'scripts/verify-c2-precision-pages.mjs')).Hash}
$Inputs += [pscustomobject]@{Path='scripts/verify-c3-permission-pages.mjs';Hash=(Get-FileHash -LiteralPath (Join-Path $Root 'scripts/verify-c3-permission-pages.mjs')).Hash}
$Inputs += [pscustomobject]@{Path='scripts/verify-c3-expression-pages.mjs';Hash=(Get-FileHash -LiteralPath (Join-Path $Root 'scripts/verify-c3-expression-pages.mjs')).Hash}
$Inputs += [pscustomobject]@{Path='scripts/verify-c3-matrix-templates.mjs';Hash=(Get-FileHash -LiteralPath (Join-Path $Root 'scripts/verify-c3-matrix-templates.mjs')).Hash}
$Inputs += [pscustomobject]@{Path='scripts/verify-c3-read-entries.mjs';Hash=(Get-FileHash -LiteralPath (Join-Path $Root 'scripts/verify-c3-read-entries.mjs')).Hash}
foreach($File in @('scripts/verify-c3-permission-races.mjs','scripts/form-checks/C3OwnedDefinitionLock.java')){$Inputs += [pscustomobject]@{Path=$File;Hash=(Get-FileHash -LiteralPath (Join-Path $Root $File)).Hash}}
foreach($File in @('scripts/verify-c3-oauth-resources.mjs','scripts/configure-oauth2-integration.ps1','scripts/restart-isolated-integration-service.ps1')){$Inputs += [pscustomobject]@{Path=$File;Hash=(Get-FileHash -LiteralPath (Join-Path $Root $File)).Hash}}
if($OauthResources){foreach($Name in @('auth','gateway')){$File=".cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/$Name/integration.properties";$Inputs += [pscustomobject]@{Path=$File;Hash=(Get-FileHash -LiteralPath (Join-Path $Root $File)).Hash}}}
$Inputs += [pscustomobject]@{Path='scripts/verify-c3-linked-reads.mjs';Hash=(Get-FileHash -LiteralPath (Join-Path $Root 'scripts/verify-c3-linked-reads.mjs')).Hash}
$Inputs += [pscustomobject]@{Path='scripts/verify-c3-action-returns.mjs';Hash=(Get-FileHash -LiteralPath (Join-Path $Root 'scripts/verify-c3-action-returns.mjs')).Hash}
$Inputs += [pscustomobject]@{Path='scripts/verify-c4-version-records.mjs';Hash=(Get-FileHash -LiteralPath (Join-Path $Root 'scripts/verify-c4-version-records.mjs')).Hash}
$Inputs += [pscustomobject]@{Path='scripts/verify-c4-version-pages.mjs';Hash=(Get-FileHash -LiteralPath (Join-Path $Root 'scripts/verify-c4-version-pages.mjs')).Hash}
foreach($File in @('scripts/verify-c3-permission-cache.mjs','scripts/form-checks/C3OwnedPermissionCache.java','cloudflow-backend/cloudflow-service-workflow/target/batch-c-classpath.txt')){$Inputs += [pscustomobject]@{Path=$File;Hash=(Get-FileHash -LiteralPath (Join-Path $Root $File)).Hash}}
Assert-Inputs
$Inputs|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
$Before=@(Get-ChildItem -LiteralPath $Run -File -Filter 'live-result-*.json'|Select-Object -ExpandProperty Name)
Push-Location $Root
try {
    $Extra=@(if($ErrorPages){'--error-pages'};if($ValueBoundaries){'--value-boundaries'};if($ValuePages){'--value-pages'};if($DictionaryPages){'--dictionary-pages'};if($LayoutPages){'--layout-pages'};if($OriginalPages){'--original-pages'};if($HistoricalReferences){'--historical-references'};if($DesignerOperations){'--designer-operations'};if($SubtableMobile){'--subtable-mobile'};if($SubtableNative){'--subtable-native'};if($SubtableTypes){'--subtable-types'};if($SubtableDesigner){'--subtable-designer'};if($SubtablePrecision){'--subtable-precision'})
    if($PermissionPages){$Extra+='--permission-pages'}
    if($ExpressionPages){$Extra+='--expression-pages'}
    if($PermissionCache){$Extra+='--permission-cache'}
    if($MatrixTemplates){$Extra+='--matrix-templates'}
    if($ReadEntries){$Extra+='--read-entries'}
    if($PermissionRaces){$Extra+='--permission-races'}
    if($OauthResources){$Extra+='--oauth-resources'}
    if($LinkedReads){$Extra+='--linked-reads'}
    if($ActionReturns){$Extra+='--action-returns'}
    if($VersionRecords){$Extra+='--version-records'}
    & node scripts/verify-batch-c-live.mjs --isolated (Join-Path $Run 'state.json') @Extra *> (Join-Path $Output 'live.log')
    $RunExit=$LASTEXITCODE
    $Added=@(Get-ChildItem -LiteralPath $Run -File -Filter 'live-result-*.json'|Where-Object{$_.Name -notin $Before})
    if($Added.Count -ne 1){throw 'Exactly one live form result required'}
    $Result=Get-Content -LiteralPath $Added[0].FullName -Raw|ConvertFrom-Json
    $Result|ConvertTo-Json -Depth 12|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
    if($ErrorPages){
        & node scripts/cleanup-c1-error-page-roles.mjs $Round *> (Join-Path $Output 'role-retirement.log')
        if($LASTEXITCODE -ne 0){throw 'Page test role retirement failed; original result and grants retained for recovery'}
        Get-Content -LiteralPath (Join-Path $Output 'role-retirement.log')|Where-Object{$_ -match '^C1_ROLE_RETIREMENT:'}
    }
    Get-Content -LiteralPath (Join-Path $Output 'live.log')|Where-Object{$_ -match '^C_ISOLATION:|^C1_REAL_ERROR_PAGES:|^C1_VALUE_BOUNDARIES:|^C1_VALUE_PAGES:|^C1_DICTIONARY_PAGES:|^C1_LAYOUT_PAGES:|^C1_ORIGINAL_PAGES:|^C_LOG_SCAN |^C_AUDIT_SCAN |^C_LIVE_(HTTP=|SUMMARY|FAILED=)'}
    if($HistoricalReferences){Get-Content -LiteralPath (Join-Path $Output 'live.log')|Where-Object{$_ -match '^C1_HISTORICAL_REFERENCES:'};if(-not $Result.historicalReferencesExecuted){throw 'Historical reference verification incomplete; retained evidence'}}
    if($DesignerOperations){Get-Content -LiteralPath (Join-Path $Output 'live.log')|Where-Object{$_ -match '^C1_DESIGNER_OPERATIONS:'};if(-not $Result.designerOperationsExecuted){throw 'Designer operation verification incomplete; retained evidence'}}
    if($SubtableMobile){Get-Content -LiteralPath (Join-Path $Output 'live.log')|Where-Object{$_ -match '^C2_MOBILE_SUBTABLE_PAGES:|^C2_FORM_SAVE_AUDIT:'};if(-not $Result.subtableMobileExecuted){throw 'Mobile subtable verification incomplete; retained evidence'}}
    if($SubtableNative){Get-Content -LiteralPath (Join-Path $Output 'live.log')|Where-Object{$_ -match '^C2_NATIVE_TABLE_PAGES:|^C2_FORM_SAVE_AUDIT:'};if(-not $Result.subtableNativeExecuted){throw 'Native table verification incomplete; retained evidence'}}
    if($SubtableTypes){Get-Content -LiteralPath (Join-Path $Output 'live.log')|Where-Object{$_ -match '^C2_TYPE_PAGES:|^C2_FORM_SAVE_AUDIT:|^C2_TYPES_RATE_WAIT:'};if(-not $Result.subtableTypesExecuted){throw 'Typed subtable verification incomplete; retained evidence'}}
    if($SubtableDesigner){Get-Content -LiteralPath (Join-Path $Output 'live.log')|Where-Object{$_ -match '^C2_DESIGNER_PAGES:|^C2_FORM_SAVE_AUDIT:'};if(-not $Result.subtableDesignerExecuted){throw 'Subtable designer verification incomplete; retained evidence'}}
    if($SubtablePrecision){Get-Content -LiteralPath (Join-Path $Output 'live.log')|Where-Object{$_ -match '^C2_PRECISION_PAGES:|^C2_FORM_SAVE_AUDIT:'};if(-not $Result.subtablePrecisionExecuted){throw 'Subtable precision verification incomplete; retained evidence'}}
    if($PermissionPages){Get-Content -LiteralPath (Join-Path $Output 'live.log')|Where-Object{$_ -match '^C3_PERMISSION_PAGES:'};if(-not $Result.permissionPagesExecuted){throw 'Field permission verification incomplete; retained evidence'}}
    if($ExpressionPages){Get-Content -LiteralPath (Join-Path $Output 'live.log')|Where-Object{$_ -match '^C3_EXPRESSION_PAGES:|^C2_FORM_SAVE_AUDIT:'};if(-not $Result.expressionPagesExecuted){throw 'Expression page verification incomplete; retained evidence'}}
    if($PermissionCache){Get-Content -LiteralPath (Join-Path $Output 'live.log')|Where-Object{$_ -match '^C3_PERMISSION_CACHE:|^C2_FORM_SAVE_AUDIT:'};if(-not $Result.permissionCacheExecuted){throw 'Permission cache verification incomplete; retained evidence'}}
    if($MatrixTemplates){Get-Content -LiteralPath (Join-Path $Output 'live.log')|Where-Object{$_ -match '^C3_MATRIX_TEMPLATES:|^C2_FORM_SAVE_AUDIT:'};if(-not $Result.matrixTemplatesExecuted){throw 'Matrix template verification incomplete; retained evidence'}}
    if($ReadEntries){Get-Content -LiteralPath (Join-Path $Output 'live.log')|Where-Object{$_ -match '^C3_READ_ENTRIES:|^C2_FORM_SAVE_AUDIT:'};if(-not $Result.readEntriesExecuted){throw 'Read-entry verification incomplete; retained evidence'}}
    if($PermissionRaces){Get-Content -LiteralPath (Join-Path $Output 'live.log')|Where-Object{$_ -match '^C3_PERMISSION_RACES:|^C2_FORM_SAVE_AUDIT:'};if(-not $Result.permissionRacesExecuted){throw 'Permission race verification incomplete; retained evidence'}}
    if($OauthResources){Get-Content -LiteralPath (Join-Path $Output 'live.log')|Where-Object{$_ -match '^C3_OAUTH_RESOURCES:|^C2_FORM_SAVE_AUDIT:'};if(-not $Result.oauthResourcesExecuted){throw 'OAuth resource verification incomplete; retained evidence'}}
    if($LinkedReads){Get-Content -LiteralPath (Join-Path $Output 'live.log')|Where-Object{$_ -match '^C3_LINKED_READS:|^C2_FORM_SAVE_AUDIT:'};if(-not $Result.linkedReadsExecuted){throw 'Linked reads verification incomplete; retained evidence'}}
    if($ActionReturns){Get-Content -LiteralPath (Join-Path $Output 'live.log')|Where-Object{$_ -match '^C3_ACTION_RETURNS:|^C2_FORM_SAVE_AUDIT:'};if(-not $Result.actionReturnsExecuted){throw 'Action returns verification incomplete; retained evidence'}}
    if($VersionRecords){Get-Content -LiteralPath (Join-Path $Output 'live.log')|Where-Object{$_ -match '^C4_VERSION_RECORDS:|^C2_FORM_SAVE_AUDIT:'};if(-not $Result.versionRecordsExecuted){throw 'Version records verification incomplete; retained evidence'}}
    Assert-Inputs
    "C1_FORM_LIVE: inputs=$($Inputs.Count); changed=0; exit=$RunExit; passed=$($Result.passed); isolated=$($Result.isolated); scope=$($Result.scope); checks=$($Result.checks.Count); requests=$($Result.requests.Count); production_modified=false"|Tee-Object -FilePath (Join-Path $Output 'summary.log')
    if($RunExit -ne 0 -or -not $Result.passed -or -not $Result.isolated -or $Result.scope -ne 'FULL_C' -or @($Result.checks|Where-Object{-not $_.passed}).Count -or ($ErrorPages -and -not $Result.errorPagesExecuted) -or ($ValueBoundaries -and -not $Result.valueBoundariesExecuted) -or ($ValuePages -and -not $Result.valuePagesExecuted) -or ($DictionaryPages -and -not $Result.dictionaryPagesExecuted) -or ($LayoutPages -and -not $Result.layoutPagesExecuted) -or ($OriginalPages -and -not $Result.originalPagesExecuted)){throw 'Live form verification failed or required scope missing; evidence retained'}
} finally {Pop-Location;Assert-Inputs}
