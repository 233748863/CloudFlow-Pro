param()
$ErrorActionPreference = 'Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Workspace = 'D:\CloudFlowPro'
$Evidence = Join-Path $Workspace '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Verified = [Collections.Generic.HashSet[int]]::new()

function Require-Evidence([int[]]$Items, [string]$File, [string[]]$Patterns) {
    $Content = [IO.File]::ReadAllText((Join-Path $Evidence $File))
    foreach ($Pattern in $Patterns) { if ($Content -notmatch $Pattern) { throw "Missing evidence: $File; pattern=$Pattern" } }
    foreach ($Item in $Items) { [void]$Verified.Add($Item) }
    Write-Output "CHECKLIST_EVIDENCE: items=$($Items -join ','); file=$File; required_markers_present=true"
}

Require-Evidence @(1) 'h2-asset-reminder-install-20261001-r2.log' @('BUILD SUCCESS', '\[static-rules\] no findings', 'BACKEND_INPUTS: files=3776; changes=0; exit=0')
$Install = [IO.File]::ReadAllText((Join-Path $Evidence 'h2-asset-reminder-install-20261001-r2.log'))
if ([regex]::Matches($Install, '(?m)^\[INFO\] .+\.{2,}\s+SUCCESS\s+\[').Count -ne 29) { throw 'Complete 29-module build required' }
Require-Evidence @(2,3) 'h2-asset-reminder-frontend-20261001-r2.log' @('> tsc --noEmit', 'built in ', 'FRONTEND_INPUTS: files=1469; changes=0; exit=0')
Require-Evidence @(4) 'h2-settlement-reversal-final-netting-db-20261001-r1.log' @('file=01.cloudflow-common.sql; exit=0', 'file=02.cloudflow-workflow.sql; exit=0', 'file=03.cloudflow-hr.sql; exit=0', 'file=04.cloudflow-oa.sql; exit=0', 'file=05.cloudflow-crm.sql; exit=0', 'file=06.cloudflow-business-seed.sql; exit=0', 'expected=374; actual=374')
Require-Evidence @(5,6) 'h2-asset-reminder-menu-scope-20261001-r1.log' @('expected=884; actual=884; missing=0; unexpected=0', 'EMPLOYEE_UNEXPECTED_GRANTS=0; EMPLOYEE_UNEXPECTED_WRITE_PERMISSIONS=0', 'APPROVED_MENU_SCOPE_PASS=true')
Require-Evidence @(7,8,9,10,11,13) 'h2-asset-reminder-source-20261001-r2.log' @('JAVA_SQL_CONCAT: matches=0', 'MP_SQL_LAST_APPLY: matches=0', 'MYBATIS_ANNOTATION_SQL: matches=0', 'login_only_external_endpoints=0', 'JAVA_PERMISSION_PREFIXES:.*invalid=0', 'FRONTEND_PERMISSION_LITERALS:.*invalid=0', 'STATIC_WHITELIST: entries=9; unique_locations=4; stale_lines=0', 'EXIT_CODE=0')
Require-Evidence @(12) 'h2-asset-reminder-configuration-20261001-r1.log' @('encrypted_fields=3; verified_decryptions=3; plaintext_fields=0; http_secret_leaks=0; external_send_requests=0', 'CONFIGURATION_LOG_SCAN: files=333;.*leaks=0')
Require-Evidence @(14) 'h2-settlement-reversal-demo-seed-20261001-r2.log' @('DEMO_REGENERATED_MATCHES_FORMAL=True', 'formal_modified=false')
Require-Evidence @() 'h2-asset-reminder-real-20261001-r4.log' @('checks=137; failed=0; requests=138', '"uiComplete":true', '"assetReminder":true', '"assetReminderRollback":true', '"assetReminderLostResponse":true', '三个故障触发器全部清理', '实际结算专项结束后原菜单和角色授权保持原样', '人事完整历史下仍能按编号倒序分页', '财务完整历史下仍能按编号倒序分页', '发送提醒未截断100字符员工姓名')
Require-Evidence @() 'h2-asset-reminder-java-types-20261001-r2.log' @('files=3631; inferred_declarations=0')
Require-Evidence @() 'h2-asset-reminder-contracts-20261001-r1.log' @('通过 42，失败 0，待同步 0')

Push-Location $Workspace
try {
    foreach ($Kind in @('backend', 'frontend')) {
        $Before = @(Get-Content -LiteralPath (Join-Path $Evidence "h2-asset-reminder-$Kind-inputs-20261001-r2.json") -Raw | ConvertFrom-Json)
        if ($Kind -eq 'backend') {
            $Paths = @(rg --files --hidden --no-ignore cloudflow-backend -g '!**/target/**' -g '!**/.git/**' -g '!**/node_modules/**' -g '!**/.cache/**' -g '!**/*.log' | Sort-Object)
        } else {
            $Paths = @(rg --files --hidden --no-ignore cloudflow-frontend -g '!**/node_modules/**' -g '!**/dist/**' -g '!**/.git/**' -g '!**/target/**' -g '!**/.cache/**' -g '!**/.vite/**' -g '!**/.tmp/**' -g '!**/.codex-logs/**' -g '!**/*.log' -g '!**/*.tsbuildinfo' | Sort-Object)
        }
        $PathChanges = @(Compare-Object @($Before.Path | Sort-Object) $Paths)
        $ContentChanges = @($Before | Where-Object { -not (Test-Path -LiteralPath $_.Path) -or (Get-FileHash -LiteralPath $_.Path -Algorithm SHA256).Hash -ne $_.Hash })
        if ($Before.Count -eq 0 -or $PathChanges.Count -ne 0 -or $ContentChanges.Count -ne 0) { throw "Current $Kind inputs differ from verified build" }
        Write-Output "CURRENT_INPUTS: kind=$Kind; files=$($Before.Count); path_changes=0; content_changes=0"
    }
    $Previous = @(Get-Content -LiteralPath (Join-Path $Evidence 'h2-settlement-reversal-final-inputs-20261001-r1.json') -Raw | ConvertFrom-Json)
    $Sql = @($Previous | Where-Object { $_.Path -match '[\\/]DB[\\/]' })
    $SqlChanges = @($Sql | Where-Object { -not (Test-Path -LiteralPath $_.Path) -or (Get-FileHash -LiteralPath $_.Path -Algorithm SHA256).Hash -ne $_.Hash })
    if ($Sql.Count -ne 8 -or $SqlChanges.Count -ne 0) { throw 'Prior SQL evidence cannot be reused' }
    Write-Output 'SQL_BASELINE_REUSE: files=8; changed=0; empty_database_and_demo_evidence_reused=true; schema_or_grants_added=false'
} finally { Pop-Location }
if ($Verified.Count -ne 14) { throw 'All 14 checklist items required' }
Write-Output 'H2_ASSET_REMINDER_CHECKLIST: items=14; missing=0; backend_modules=29; complete_hr08_global_regression=false; complete_35_prd=false; production_modified=false'
