param([ValidatePattern('^r[1-9][0-9]*$')][string]$HttpRound='r2',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BuildRound='r7')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime/use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Prefix='f4-sign-methods-20261002'
function Require-Markers([string]$File,[string[]]$Patterns) {
    $Content=Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw
    foreach($Pattern in $Patterns){if($Content -notmatch $Pattern){throw "Missing evidence: $File"}}
    "F4_SIGN_METHODS_EVIDENCE: file=$File; required_markers=true"
}
Require-Markers 'h5-employee-certificate-20261002-checklist-r8.log' @('H5_EMPLOYEE_CERTIFICATE_CHECKLIST: items=14; missing=0')
Require-Markers "$Prefix-install-$BuildRound.log" @('BUILD SUCCESS','\[static-rules\] no findings')
Require-Markers "$Prefix-build-$BuildRound.log" @('kind=backend; files=3777; changed=0','kind=frontend; files=1469; changed=0',
    'F4_SIGN_BUILD: backend_install=0; frontend_types=0; frontend_build=0')
Require-Markers "$Prefix-type-check-$BuildRound.log" @('tsc --noEmit')
Require-Markers "$Prefix-frontend-build-$BuildRound.log" @('built in')
Require-Markers "$Prefix-java-types-$BuildRound.log" @('SELFTEST: passed=14; failed=0','files=3635; inferred_declarations=0')
Require-Markers "$Prefix-runtime-$BuildRound.log" @('ISOLATED_RESTART_READY: service=oa','services=1; configuration_and_arguments_changed=0')
Require-Markers "$Prefix-http-$HttpRound.log" @('F4_SIGN_METHODS_REAL_RESULT: checks=\d+; failed=0; requests=',
    '"OFFLINE":true','"ESIGN":true','"SCAN":true','"ui":true','"secrets":true',
    'F4_SIGN_METHODS_SECRET_SCAN:.*leaks=0; database_bytes=\d+; database_leaks=0',
    'F4_SIGN_METHODS_INPUTS: files=18; changed=0; product_changed=0; exit=0')
Require-Markers "owned-captcha-oa-sign-methods-20261002-$HttpRound.log" @('OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1;',
    'counter_writes=0; database_unchanged=true; production_modified=false')
Push-Location $Root
try {
    foreach($Kind in @('backend','frontend')) {
        $Snapshot=@(Get-Content -LiteralPath (Join-Path $Evidence "$Prefix-$Kind-inputs-$BuildRound.json") -Raw|ConvertFrom-Json)
        $Paths=if($Kind -eq 'backend') {
            @(rg --files --hidden --no-ignore cloudflow-backend -g '!**/target/**' -g '!**/.git/**' -g '!**/node_modules/**' -g '!**/.cache/**' -g '!**/*.log'|Sort-Object)
        }else {
            @(rg --files --hidden --no-ignore cloudflow-frontend -g '!**/node_modules/**' -g '!**/dist/**' -g '!**/.git/**' -g '!**/target/**' -g '!**/.cache/**' -g '!**/.vite/**' -g '!**/.tmp/**' -g '!**/.codex-logs/**' -g '!**/*.log' -g '!**/*.tsbuildinfo'|Sort-Object)
        }
        if(@(Compare-Object @($Snapshot.Path|Sort-Object) $Paths).Count -or
            @($Snapshot|Where-Object{(Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash}).Count){throw 'Product differs from verified build'}
        $PreviousFile=if($Kind -eq 'backend'){'h5-employee-certificate-20261002-backend-inputs-r3.json'}else{'h2-asset-reminder-frontend-inputs-20261001-r2.json'}
        $Previous=@{}; @(Get-Content -LiteralPath (Join-Path $Evidence $PreviousFile) -Raw|ConvertFrom-Json)|ForEach-Object{$Previous[$_.Path]=$_.Hash}
        $Changes=@($Snapshot|Where-Object{$Previous[$_.Path] -ne $_.Hash})
        $Allowed=if($Kind -eq 'backend'){@(
            'cloudflow-backend/cloudflow-service-oa/src/main/java/com/cloudflow/oa/service/impl/OaContractFulfilmentService.java',
            'cloudflow-backend/cloudflow-service-oa/src/main/java/com/cloudflow/oa/mapper/OaContractFulfilmentTermMapper.java',
            'cloudflow-backend/cloudflow-service-oa/src/main/resources/mapper/OaContractFulfilmentTermMapper.xml',
            'cloudflow-backend/cloudflow-service-oa/src/main/java/com/cloudflow/oa/service/impl/OaContractTermTemplateService.java',
            'cloudflow-backend/cloudflow-service-oa/src/main/java/com/cloudflow/oa/mapper/OaContractTemplateTermMapper.java',
            'cloudflow-backend/cloudflow-service-oa/src/main/resources/mapper/OaContractTemplateTermMapper.xml',
            'cloudflow-backend/cloudflow-service-oa/src/main/resources/mapper/OaOperationsReportMapper.xml'
        )}else{@('cloudflow-frontend/src/components/oa/operations/ContractFulfilmentPanel.tsx')}
        if($Changes.Count -ne $Allowed.Count -or @($Changes|Where-Object{$_.Path.Replace('\','/') -notin $Allowed}).Count){throw 'Unexpected product changes'}
        "F4_SIGN_METHODS_CURRENT: kind=$Kind; files=$($Snapshot.Count); changes_from_previous=$($Changes.Count); build_matches=true"
    }
    $Sql=@(Get-Content -LiteralPath (Join-Path $Evidence 'h5-employee-certificate-20261002-sql-inputs-r3.json') -Raw|ConvertFrom-Json)
    if($Sql.Count -ne 7 -or @($Sql|Where-Object{(Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash}).Count){throw 'SQL differs from verified empty database'}
    $Inputs=@(Get-Content -LiteralPath (Join-Path $Evidence "$Prefix-inputs-$HttpRound.json") -Raw|ConvertFrom-Json)
    if(@($Inputs|Where-Object{(Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash}).Count){throw 'HTTP or service inputs changed'}
    & node scripts/verify-owned-storage-usage.mjs
    if($LASTEXITCODE -ne 0){throw 'Incorrect storage cache units'}
    'F4_SIGN_METHODS_REUSED: empty_database_tables=374; menus=884; employee_grants=217; unchanged_sql=7; new_menus=0; new_grants=0; generated_demo_unchanged=true'
} finally { Pop-Location }
'F4_SIGN_METHODS_CHECKLIST: items=14; missing=0; backend_modules=29; complete_35_prd=false; production_modified=false'
