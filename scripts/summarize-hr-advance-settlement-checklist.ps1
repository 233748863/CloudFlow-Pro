param([ValidatePattern('^r[1-9][0-9]*$')][string]$RuntimeRound='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r26',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r56', [switch]$PayrollDeduction, [switch]$AllSources, [switch]$Referral, [switch]$Repayment)
$ErrorActionPreference='Stop'
$Root='D:\CloudFlowPro'
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
if($AllSources -and -not $PayrollDeduction){throw 'All sources require payroll deduction mode'}
if($Referral -and -not $AllSources){throw 'Referral requires all settlement sources'}
if($Repayment -and -not $Referral){throw 'Repayment requires referral mode'}
$Prefix=if($Repayment){'h2-settlement-referral-repay'}elseif($Referral){'h2-settlement-referral'}elseif($AllSources){'h2-settlement-all-sources'}elseif($PayrollDeduction){'h2-advance-settlement-payroll'}else{'h2-advance-settlement'}
$PostedEntries=if($PayrollDeduction){2}else{1}
$RestoredEntries=if($PayrollDeduction){5}else{2}
$Reserved=if($PayrollDeduction){'50.00'}else{'0.00'}
function Require-Markers([string]$File,[string[]]$Markers){
    $Content=Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw
    foreach($Marker in $Markers){if($Content -notmatch $Marker){throw "Required advance settlement evidence missing: $File"}}
    "H2_ADVANCE_SETTLEMENT_EVIDENCE: file=$File; markers=true"
}
function Assert-Inputs([string]$File){
    $Inputs=@(Get-Content -LiteralPath (Join-Path $Evidence $File) -Raw|ConvertFrom-Json)
    if(-not $Inputs.Count){throw 'Nonempty input snapshot required'}
    foreach($Item in $Inputs){$Path=if([IO.Path]::IsPathRooted($Item.Path)){$Item.Path}else{Join-Path $Root $Item.Path};if((Get-FileHash -LiteralPath $Path).Hash -ne $Item.Hash){throw "Input differs: $File"}}
    "H2_ADVANCE_SETTLEMENT_INPUT_SNAPSHOT: file=$File; files=$($Inputs.Count); changed=0"
}
Require-Markers "h3-portal-finance-20261002-backend-$BackendRound.log" @('BUILD SUCCESS','\[static-rules\] no findings','FINANCE_BUILD: phase=Backend; files=3821; changed=0; exit=0')
Require-Markers 'h3-portal-finance-20261002-frontend-r7.log' @('> tsc --noEmit','built in ','FINANCE_BUILD: phase=Frontend; files=1475; changed=0; exit=0')
Assert-Inputs "h3-portal-finance-20261002-backend-$BackendRound-inputs.json"
Assert-Inputs 'h3-portal-finance-20261002-frontend-r7-inputs.json'
$Adjacent="h3-portal-finance-adjacent-20261002-$AdjacentRound"
Require-Markers "$Adjacent/summary.log" @('regenerated_matches_formal=true; formal_modified=false','changed=0; exit=0; production_modified=false')
Require-Markers "$Adjacent/oa-database.log" @('Complete approved schema table count; expected=374; actual=374','PASS: 1012 OA boundary assertions')
Require-Markers "$Adjacent/sources.log" @('MP_SQL_LAST_APPLY: matches=0','MYBATIS_ANNOTATION_SQL: matches=0','login_only_external_endpoints=0',
    'JAVA_PERMISSION_PREFIXES:.*invalid=0','STATIC_WHITELIST:.*stale_lines=0','EXIT_CODE=0')
Require-Markers "$Adjacent/menu.log" @('EMPLOYEE_UNEXPECTED_GRANTS=0; EMPLOYEE_UNEXPECTED_WRITE_PERMISSIONS=0','APPROVED_MENU_SCOPE_PASS=true')
Assert-Inputs "$Adjacent/inputs.json"
if($Repayment){
    Require-Markers "$Prefix-20261004-http-$RuntimeRound.log" @('H2_ADVANCE_APPROVAL_REAL_RESULT: checks=[1-9][0-9]*; failed=0; requests=[1-9][0-9]*;',
        '"independentApproval":true','"posted":true','"replayed":true','"closed":true','"historyPreserved":true','"restoration":true','"secrets":true',
        'stage=draft; settlement=[0-9]+; amount=23650.28; bonus_payments=1',
        'stage=confirmed; settlement=[0-9]+; amount=23650.28; bonus_payments=1',
        'stage=closed; settlement=[0-9]+; amount=23650.28; bonus_payments=2','"leaks":0','"databaseLeaks":0',
        'H2_ADVANCE_SETTLEMENT_INPUTS: files=[1-9][0-9]*; changed=0; product_changed=0; exit=0')
} else {
Require-Markers "$Prefix-20261004-http-$RuntimeRound.log" @('H2_ADVANCE_APPROVAL_REAL_RESULT: checks=[1-9][0-9]*; failed=0; requests=[1-9][0-9]*;',
    '"resignationApproved":true','"resignationCompleted":true','"offboardAtomicity":true','"offboardRepeat":true','"restoration":true','"secrets":true',
    '"reversalRestoredSources":true','"reversalPrivateProof":true','"fundsClosed":true',
    "stage=posted; outstanding=0.00; reserved=0.00; entries=$PostedEntries",
    "stage=restored; outstanding=100.00; reserved=$Reserved; entries=$RestoredEntries",
    "stage=replacementDraft; outstanding=100.00; reserved=$Reserved; entries=$RestoredEntries",
    '"leaks":0','"databaseLeaks":0',
    'H2_ADVANCE_SETTLEMENT_INPUTS: files=[1-9][0-9]*; changed=0; product_changed=0; exit=0')
if($PayrollDeduction){Require-Markers "$Prefix-20261004-http-$RuntimeRound.log" @('"payrollCombination":true','"deduction":"50.00"','"separateReceivable":"50.00"')}
if($AllSources){Require-Markers "$Prefix-20261004-http-$RuntimeRound.log" @('"leaveTrainingCombination":true','"unit":"DAY","quantity":"2.00","amount":"1839.08"',
    '"unit":"HOUR","quantity":"4.00","amount":"459.77"','"amount":"123.45"')
    Require-Markers 'h2-training-workflow-identity-20261004-b57.log' @('scenarios=7; checks=42; failed=0','TRAINING_WORKFLOW_IDENTITY_INPUT: changed=0')
    Require-Markers 'h2-training-skills-adjacent-20261004-b57.log' @('H2_SKILL_CHECKS: checks=62; failed=0; mysql=false; http=false')}
if($Referral){Require-Markers "$Prefix-20261004-http-$RuntimeRound.log" @('"referralCombination":true','"amount":"1234.56"',
    '组合奖金冲正关联原付款并恢复待发','组合奖金replacementDraft仅通过同一工资汇入1234.56元')
    Require-Markers 'h2-referral-identities-20261004-b58-r2.log' @('H2_OFFER_DECISIONS: scenarios=6; checks=70; failed=0;',
        'H2_REFERRAL_IDENTITIES: checks=[1-9][0-9]*; failed=0;', 'owned_schema_remaining=0; runtime_tables=374;')}
}
Assert-Inputs "$Prefix-20261004-inputs-$RuntimeRound.json"
$RunExit=if($Repayment){'H2_REFERRAL_REPAY_RUN_EXIT=0'}else{'H2_ADVANCE_SETTLEMENT_RUN_EXIT=0'}
Require-Markers "$Prefix-launch-20261004-$RuntimeRound.log" @($RunExit,'OWNED_CAPTCHA_RESTORED: original_limit=100; original_ttl=-1;',
    'counter_writes=0; database_unchanged=true; production_modified=false')
$State=Get-Content -LiteralPath (Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/state.json') -Raw|ConvertFrom-Json
if($State.status -ne 'RUNNING' -or $State.processes.Count -ne 9 -or $State.services.Count -ne 6){throw 'Owned environment incomplete'}
foreach($Entry in $State.processes){$Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)";if(-not $Observed -or -not $Observed.CommandLine.Contains($Entry.marker)){throw 'Owned process identity mismatch'}}
foreach($Service in $State.services){$Health=Invoke-RestMethod -Uri "http://127.0.0.1:$($Service.healthPort)/actuator/health" -TimeoutSec 15;if($Health.status -ne 'UP'){throw 'Owned service unhealthy'}}
$Items=@('maven-install-and-static-rules','frontend-types','frontend-build','formal-schema-374','menu-scope',
    'employee-grants','sql-concatenation','external-endpoint-protection','mybatis-last-apply','annotation-sql',
    'permission-prefixes','secret-protection-and-runtime-scan','static-whitelist','regenerated-demo')
foreach($Item in $Items){"H2_ADVANCE_SETTLEMENT_CHECKLIST_ITEM: item=$Item; passed=true"}
'H2_ADVANCE_SETTLEMENT_RESTORATION: owned_processes=9; healthy_services=6; original_config_unchanged=true'
if($Repayment){"H2_REFERRAL_REPAY_CHECKLIST: items=$($Items.Count); missing=0; same_employee_actual_chain=true; second_actual_payment=23650.28; bonus_actual_payments=2; bonus_actual_returns=1; advance_repaid=100.00; complete_35_prd=false; production_modified=false"}
else {"H2_ADVANCE_SETTLEMENT_CHECKLIST: items=$($Items.Count); missing=0; same_employee_actual_chain=true; advance_restored=100.00; payroll_combination=$($PayrollDeduction.IsPresent.ToString().ToLowerInvariant()); payroll_reserved=$Reserved; leave_training_combination=$($AllSources.IsPresent.ToString().ToLowerInvariant()); complete_35_prd=false; production_modified=false"}
