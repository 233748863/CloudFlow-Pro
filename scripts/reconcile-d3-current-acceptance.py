"""Read-only D3 version reconciliation; preserve the versions of original executions."""
import hashlib
import json
import pathlib
import re
import subprocess
import sys
import urllib.request

ROOT = pathlib.Path(r'D:\CloudFlowPro')
EVIDENCE = ROOT / '.cloudflow-runtime/full-prd-20260915/approved-runtime'
RUN = ROOT / '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
round_name = sys.argv[1] if len(sys.argv) == 2 else ''
assert re.fullmatch(r'r[1-9][0-9]*', round_name), 'Unique report round required'
output = EVIDENCE / f'd3-version-reconciliation-20261006-{round_name}.json'
assert not output.exists(), 'Retain original reconciliation'
artifacts = {}


def digest_bytes(data):
    return hashlib.sha256(data).hexdigest().upper()


def digest(file):
    before = file.stat()
    with file.open('rb') as stream:
        value = hashlib.file_digest(stream, 'sha256').hexdigest().upper()
    after = file.stat()
    assert (before.st_size, before.st_mtime_ns) == (after.st_size, after.st_mtime_ns), 'File changed while reading'
    return value


def keep(file):
    artifacts[str(file.relative_to(ROOT))] = digest(file)


def read(name):
    file = EVIDENCE / name
    keep(file)
    return json.loads(file.read_text(encoding='utf-8-sig'))


def verify_artifacts(report, base):
    for artifact in report['artifacts']:
        file = base / artifact['Path']
        assert digest(file) == artifact['Hash'].upper(), 'Original evidence changed: ' + artifact['Path']
        keep(file)


def snapshot(*names):
    result = {}
    for name in names:
        for row in read(name):
            key = row['Path'].replace('\\', '/')
            assert key not in result, 'Duplicate build input'
            result[key] = row['Hash'].upper()
    return result


old = snapshot('h3-portal-finance-20261002-backend-r108-inputs.json',
               'h3-portal-finance-20261002-frontend-r66-inputs.json')
current = snapshot('h3-portal-finance-20261002-backend-r113-inputs.json',
                   'h3-portal-finance-20261002-frontend-r72-inputs.json')
for name, wanted in current.items():
    assert digest(ROOT / name) == wanted, 'Current build input changed: ' + name
changed = {name for name in old if name in current and old[name] != current[name]}
added = set(current) - set(old)
assert not set(old) - set(current), 'Product input deleted'

hr = 'cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/'
front = 'cloudflow-frontend/src/'
config = hr + 'service/HrPayrollConfigurationService.java'
calculator = hr + 'service/HrPayrollTaxCalculator.java'
crud = hr + 'service/HrTypedCrudService.java'
page = front + 'pages/hr/rules/HrPayrollPage.tsx'
router = front + 'router.tsx'
seeds = {'cloudflow-backend/DB/06.cloudflow-business-seed.sql', 'cloudflow-backend/DB/07.cloudflow-demo-seed.sql'}
packaging = {'cloudflow-backend/pom.xml', 'cloudflow-backend/Dockerfile'}
d4_paths = {hr + 'controller/HrPerformanceResourceControllers.java', hr + 'mapper/HrGrievanceMapper.java',
            hr + 'service/HrGrievanceAccessService.java', hr + 'service/impl/HrLaborDisputeServiceImpl.java',
            'cloudflow-backend/cloudflow-service-hr/src/main/resources/mapper/HrGrievanceMapper.xml',
            front + 'pages/hr/HrPerformancePage.tsx', front + 'pages/hr/laborRelation/HrLaborDisputePage.tsx',
            front + 'pages/hr/rules/HrGrievancePage.tsx'}
assert changed == {config, calculator, crud, page, router} | seeds | packaging | d4_paths, 'Unreviewed product changes'
assert added == {front + 'pages/hr/HrPerformanceResultPage.tsx'}, 'Unreviewed added input'

# Reverse only the new labor-dispute branch. Matching the original full-file
# digest proves that all other CRUD logic, including salary scope, is unchanged.
text = (ROOT / crud).read_bytes().decode('utf-8')
text = text.replace('    private final HrGrievanceAccessService grievanceAccess;\n', '')
start = text.index('        if ("hr_labor_dispute".equals(tableInfo.getTableName())) {')
end = text.index('        if (isPrivilegedUser()) {', start)
text = text[:start] + text[end:]
assert digest_bytes(text.encode()) == old[crud], 'Shared CRUD differs beyond labor-dispute branch'

# The router has mixed line endings. Preserve its bytes while removing the six
# reviewed mobile routes; normalizing the whole file would invalidate the proof.
route_bytes = (ROOT / router).read_bytes()
routes = {'/hr/ess/grievances': 'hr:grievance:mine:list', '/hr/grievances': 'hr:grievance:manage:list',
          '/hr/labor-dispute-list': 'hr:dispute:list', '/hr/performance': 'hr:performance:list',
          '/hr/payroll': 'hr:payroll:list', '/hr/ess/slips': 'hr:ess:slip:view'}
for route, permission in routes.items():
    pattern = (rb"          \{\r?\n            path: '" + re.escape(route.encode())
               + rb"',\r?\n            element: guarded\(<DynamicMenuRoute />, \['"
               + re.escape(permission.encode()) + rb"']\),\r?\n          },\r?\n")
    route_bytes, count = re.subn(pattern, b'', route_bytes)
    assert count == 1, 'Unique mobile route and unchanged permission required'
assert digest_bytes(route_bytes) == old[router], 'Router differs beyond six reviewed mobile routes'

originals = EVIDENCE / 'd3-official-tax-originals-20261006-r1'
for name in {config, calculator, page} | seeds:
    assert digest(originals / pathlib.Path(name).name) == old[name], 'Approved implementation original differs from B108/F66'
    keep(originals / pathlib.Path(name).name)

original_config = (originals / 'HrPayrollConfigurationService.java').read_bytes().decode()
expected_config = original_config.replace('import java.util.Objects;\n', 'import java.util.Objects;\nimport java.util.Set;\n')
expected_config = expected_config.replace(
    '            if ("ACTIVE".equals(payload.getStatus())) validateDetails(id == null ? List.of() : details(id), true);',
    '            if ("ACTIVE".equals(payload.getStatus())) {\n'
    '                Set<String> roles = UserContext.getRoles();\n'
    '                if (roles == null || !roles.contains("admin") && !roles.contains("finance")) {\n'
    '                    throw new HrBusinessException("FORBIDDEN", "仅管理员或财务可启用税率表");\n'
    '                }\n'
    '                validateDetails(id == null ? List.of() : details(id), true);\n'
    '            }')
expected_config = expected_config.replace('        slab(payload.getTaxSlabId());', '        HrTaxSlab selectedSlab = slab(payload.getTaxSlabId());')
expected_config = expected_config.replace('            Map<String, Object> fields = support.configurationPayload(payload, "id");\n',
    '            Map<String, Object> fields = support.configurationPayload(payload, "id");\n'
    '            // Unsubmitted legacy fields must survive a tax-table change. New\n'
    '            // profiles initialize the required encrypted allowance explicitly.\n'
    '            if (payload.getThreshold() == null) {\n'
    '                if (id == null) fields.put("threshold", selectedSlab.getThresholdAmount());\n'
    '                else fields.remove("threshold");\n'
    '            }\n'
    '            if (payload.getTaxConfig() == null) fields.remove("taxConfig");\n', 1)
assert digest_bytes(expected_config.encode()) == current[config], 'Payroll configuration differs beyond tested activation/profile changes'
original_calculator = (originals / 'HrPayrollTaxCalculator.java').read_bytes().decode()
expected_calculator = original_calculator.replace('// TODO: 待财务提供 2026 税率表', '// 正式居民工资税表由种子提供，适用税表仍须经管理员或财务启用。').replace(
    '2026税率表待财务核定，请先配置并启用正式税率表', '请先配置完整税率档位并由管理员或财务启用适用税率表')
assert digest_bytes(expected_calculator.encode()) == current[calculator], 'Tax calculation logic changed'
original_page = (originals / 'HrPayrollPage.tsx').read_bytes().decode()
expected_page = original_page.replace('title="个税税率表" path=',
    'title="个税税率表" description="居民普通工资按累计预扣规则计算；税表由管理员或财务启用，草稿不参与算薪。" path=').replace(
    '经财务核定的每月起征额', '每月减除费用').replace('每月起征额', '每月减除费用').replace('草稿待核定', '草稿待启用').replace(
    '2026 年正式税率表须由财务提供；未核定并启用完整 7 档税率前，算薪会明确拦截。本期累计税额为负时按 0 处理。',
    '2026 年居民普通工资税表已配置完整 7 档税率，每月减除费用为 5000 元，须由管理员或财务启用后参与算薪。本期累计税额为负时按 0 处理。')
assert digest_bytes(expected_page.encode()) == current[page], 'Payroll page differs beyond approved text changes'

prior = read('d3-current-acceptance-20261006-r2.json')
assert prior['evidenceValid'] and prior['accepted'] == 17 and prior['policyPending'] == 1 and prior['sourceCount'] == 20
assert digest(ROOT / 'scripts/summarize-d3-current-acceptance.ps1') == prior['reportHash']
verify_artifacts(prior, EVIDENCE)
money = read('d3-current-money-stage-20261006-r1.json')
assert money['passed'] and digest(EVIDENCE / 'd3-current-money-stage-20261006-r1.json') == prior['moneyStageHash']
verify_artifacts(money, ROOT)
followup = read('d3-policy-followup-20261006-r1.json')
assert followup['passed'] and followup['officialTaxPolicyVerified'] and followup['backend'] == 'r113' and followup['frontend'] == 'r72'
assert digest(ROOT / 'scripts/summarize-d3-policy-followup.ps1') == followup['reportHash']
verify_artifacts(followup, EVIDENCE)
official_stage = read('d3-official-tax-stage-20261006-r1.json')
assert official_stage['passed'] and official_stage['formalTaxSeedChecks'] == 18
verify_artifacts(official_stage, EVIDENCE)
d4 = read('d4-current-acceptance-20261006-r1.json')
assert d4['passed'] and d4['all13Complete'] and d4['backend'] == 'r110' and d4['frontend'] == 'r70'
verify_artifacts(d4, EVIDENCE)
d4_build = snapshot('h3-portal-finance-20261002-backend-r110-inputs.json', 'h3-portal-finance-20261002-frontend-r70-inputs.json')
for name in d4_paths | added | {crud, router}:
    assert d4_build[name] == current[name], 'D4-related input changed since actual acceptance'
linked = read('d4-linked-20261006-r3/result.json')
assert all(linked.get(flag) is True for flag in ['passed', 'salary', 'performance', 'scope']), 'Actual linked salary route verification missing'
packages = read('backend-executable-verification-20261006-r4/result.json')
assert packages['Passed'] and packages['BackendRound'] == 'r113' and len(packages['Services']) == 6
for package in packages['Services'] + packages['CommonLibraries']:
    assert digest(ROOT / package['Path']) == package['Hash'], 'Verified current package changed'

official = 'd3-official-tax-20261006-r3'
cumulative = 'd3-cumulative-tax-20261006-r6'
scale = 'd3-batch-scale-20261006-r5'
for folder, flags in [(official, ['passed', 'officialTaxPolicyVerified', 'activation', 'boundaries', 'rounding', 'cumulative', 'yearReset']),
                      (cumulative, ['passed', 'cumulative', 'retry', 'yearReset', 'midHire', 'snapshot', 'taxTableReplacement', 'unverifiedDeduction']),
                      (scale, ['passed', 'selection', 'selectionPage', 'scale', 'progressPage', 'performanceMet'])]:
    result = read(folder + '/result.json')
    assert all(result.get(flag) is True for flag in flags), 'Targeted current verification missing'
new_sources = {1: [scale], 2: [scale], 3: [cumulative], 5: [scale, cumulative], 9: [official, cumulative],
               10: [official, cumulative], 11: [cumulative], 12: [cumulative], 15: ['d4-linked-20261006-r3'],
               16: [official], 17: [official, scale]}
rows = []
for row in prior['acceptance']:
    number = int(row['Id'].split('-')[1])
    assert row['FunctionalEvidence'] and row['Status'] == ('POLICY_PENDING' if number == 9 else 'VERIFIED')
    for source in row['Sources']:
        source_result = read(source + '/result.json')
        passed_key = 'Passed' if source in {'d3-payroll-replay-20261006-r4', 'd3-generation-resume-20261006-r2', 'd3-create-close-20261006-r1'} else 'passed'
        assert source_result[passed_key] is True, 'Prior accepted functional source failed'
    rows.append({'id': row['Id'], 'rule': row['Rule'], 'status': 'VERIFIED', 'historicalSources': row['Sources'],
                 'historicalBackend': 'r108', 'historicalFrontend': 'r66', 'currentSources': new_sources.get(number, []),
                 'basis': 'Preserved accepted evidence, exact source-scope reconciliation, targeted current execution'})
prd = ROOT / 'docs/prd/D3-HR-薪资批量与个税-PRD.md'
required = re.findall(r'^\| (AC-\d+) \|', prd.read_text(encoding='utf-8-sig'), re.M)
assert len(rows) == 18 and required == [row['id'] for row in rows], 'Actual PRD acceptance mapping differs'
keep(prd)

state = json.loads((RUN / 'state.json').read_text(encoding='utf-8-sig'))
assert state['status'] == 'RUNNING' and pathlib.Path(state['run']).resolve() == RUN.resolve()
ownership = r"""$ErrorActionPreference='Stop';$s=Get-Content -LiteralPath 'D:\CloudFlowPro\.cloudflow-runtime\batch-g-integration\9799534e1a3a47b5958330f14ae16dc7\state.json' -Raw|ConvertFrom-Json;foreach($p in $s.processes){$o=Get-CimInstance Win32_Process -Filter ('ProcessId='+$p.id);if(-not $o -or -not $o.CommandLine.Contains($p.marker)){throw 'Owned process mismatch'}};Write-Output $s.processes.Count"""
check = subprocess.run(['powershell', '-NoProfile', '-Command', ownership], capture_output=True, text=True, timeout=30, creationflags=subprocess.CREATE_NO_WINDOW)
assert check.returncode == 0 and check.stdout.strip() == '9', 'Current owned process check failed'
assert len(state['services']) == 6
for runtime in followup['runtime']:
    assert next(item for item in state['processes'] if item['name'] == runtime['name'])['id'] == runtime['pid']
    assert digest(pathlib.Path(runtime['artifact'])) == runtime['hash'], 'Runtime differs from verified deployed package'
for service in state['services']:
    with urllib.request.urlopen(f"http://127.0.0.1:{service['healthPort']}/actuator/health", timeout=5) as response:
        assert json.load(response)['status'] == 'UP', 'Service unhealthy'
script = pathlib.Path(__file__).resolve()
keep(script)
summary = {'passed': True, 'readOnly': True, 'backend': 'r113', 'frontend': 'r72', 'accepted': 18, 'acceptance': rows,
           'productInputs': len(current), 'changedInputs': sorted(changed), 'addedInputs': sorted(added),
           'exactScopeChecks': ['labor-dispute-only CRUD branch', 'six mobile routes and exact permissions',
                                'tax activation/profile preservation only', 'tax calculator message only', 'payroll page text only'],
           'runtime': followup['runtime'], 'healthyServices': 6, 'processes': 9,
           'artifacts': [{'path': name, 'sha256': value} for name, value in artifacts.items()],
           'reportHash': digest(script), 'allTestsReexecuted': False,
           'executionScope': 'Original B108/F66 executions retained; current official tax, cumulative tax, scale and unchanged D4-linked route evidence reconciled',
           'binaryScope': 'Current B113 packages verified; historical test binaries are not claimed to match current binaries',
           'relatedRound': 'r131', 'reportAddedAfterRelatedRound': True, 'officialTaxPolicyVerified': True,
           'all18Complete': True, 'globalComplete': False, 'remaining': ['D2 ordinary first request below 500ms', 'H2 full acceptance', 'Remaining PRDs and all 681 criteria']}
with output.open('x', encoding='utf-8') as stream:
    json.dump(summary, stream, ensure_ascii=False, indent=2)
print(f'D3_VERSION_RECONCILIATION: accepted=18; product_inputs={len(current)}; changed={len(changed)}; added={len(added)}; artifacts={len(artifacts)}; healthy=6; all_tests_reexecuted=false; all18_complete=true; global_complete=false')
