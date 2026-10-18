import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createD1LeaveRuntime } from './runtime-checks/d1-leave-runtime.mjs';

const root = 'D:/CloudFlowPro';
assert.ok(process.argv.includes('--d1-leave') && process.argv.includes('--d3-salary-presentation'));
const output = fs.realpathSync(process.argv[process.argv.indexOf('--output') + 1]);
assert.match(path.basename(output), /^d3-salary-presentation-20261006-r[1-9][0-9]*$/);
assert.ok(!fs.existsSync(path.join(output, 'result.json')));
const runtime = await createD1LeaveRuntime(root, output);
const { check, checks, database, requests, sensitive, sessions } = runtime;
const hash = value => createHash('sha256').update(value).digest('hex');
const slipId = '98209280908', employeeId = '98209282285';
const original = hash(database('SELECT * FROM hr_salary_slip ORDER BY id'));
const auditCount = operation => Number(database(`SELECT COUNT(*) FROM hr_audit_log WHERE tenant_id=100000 AND business_domain='SALARY_SLIP' AND business_id='${slipId}' AND operation_type='${operation}' AND operator_id=${sessions.admin.identity.userId}`));
const before = { read: auditCount('READ_HR'), export: auditCount('EXPORT_PDF') };
const evidence = { content: false, preservation: false, secrets: false };
let failure;
try {
  check('owned_paid_salary_sample', database(`SELECT COUNT(*) FROM hr_salary_slip WHERE tenant_id=100000 AND id=${slipId} AND employee_id=${employeeId} AND status='PAID' AND deleted=0 AND net_total=2371.74`) === '1');
  const response = await sessions.admin.page.evaluate(async supplied => {
    const token = (await import('/src/utils/authStorage.ts')).getAuthToken();
    const response = await fetch('/api/hr/compensation/payroll/slips/' + supplied + '/pdf', { credentials: 'same-origin', headers: { Authorization: token.startsWith('Bearer ') ? token : 'Bearer ' + token } });
    const bytes = new Uint8Array(await response.arrayBuffer());
    return { status: response.status, type: response.headers.get('Content-Type'), traceId: response.headers.get('X-Trace-Id'), bytes: Array.from(bytes) };
  }, slipId);
  requests.push({ actor: 'admin', path: '/hr/compensation/payroll/slips/' + slipId + '/pdf', status: response.status, traceId: response.traceId });
  check('actual_authorized_pdf_download', response.status === 200 && response.type.includes('application/pdf'));
  const pdf = Buffer.from(response.bytes);
  check('real_pdf_header', pdf.subarray(0, 5).toString() === '%PDF-');
  fs.writeFileSync(path.join(output, 'salary.pdf'), pdf, { flag: 'wx' });
  check('download_read_and_export_audited', auditCount('READ_HR') === before.read + 1 && auditCount('EXPORT_PDF') === before.export + 1);
  const lines = fs.readFileSync(path.join(runtime.run, 'hr/service.args'), 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/);
  const classpath = lines[lines.indexOf('-cp') + 1]?.replace(/^"|"$/g, '');
  assert.ok(classpath && classpath.includes('pdfbox-2.0.24.jar'));
  const argfile = path.join(output, 'pdf-probe.args');
  const args = ['-Dfile.encoding=UTF-8', '-cp', classpath, path.join(root, 'scripts/runtime-checks/D3SalaryPdfProbe.java'), path.join(output, 'salary.pdf'), path.join(output, 'salary.txt'), path.join(output, 'salary.png')];
  fs.writeFileSync(argfile, args.map(value => '"' + value.replaceAll('\\', '/').replaceAll('"', '\\"') + '"').join('\n'));
  const parsed = spawnSync('java', ['@' + argfile], { encoding: 'utf8', windowsHide: true, timeout: 60000 });
  fs.writeFileSync(path.join(output, 'probe.log'), parsed.stdout + parsed.stderr);
  check('actual_pdf_parsed_and_rendered', parsed.status === 0 && fs.existsSync(path.join(output, 'salary.png')));
  const contents = fs.readFileSync(path.join(output, 'salary.txt'), 'utf8');
  const savedName = database(`SELECT JSON_UNQUOTE(JSON_EXTRACT(components,'$[0].salaryComponentName')) FROM hr_salary_slip WHERE id=${slipId}`);
  check('owned_saved_payroll_component_name', savedName === 'D3D-b38126e08b99');
  const expected = [savedName, '263.53', '0.00', '工资明细', '工资月份', '员工编号', '应发', '扣除', '实发', '项目', '金额', '考勤扣款', '无薪及部分带薪假扣款', employeeId, '2026-06', '3000.30', '628.56', '2371.74', '225.02', '140.01'];
  // PDF extraction can return the Unicode compatibility glyph U+FA34 for 勤,
  // and OpenHTMLtoPDF preserves dates using a non-breaking hyphen U+2011.
  // Keep the original text and raw check while comparing their semantic forms.
  const normalized = contents.replaceAll('\u2011', '-').normalize('NFKC');
  const items = expected.map(value => ({ value, rawPresent: contents.includes(value), present: normalized.includes(value.normalize('NFKC')) }));
  fs.writeFileSync(path.join(output, 'content-check.json'), JSON.stringify({ slipId, bytes: pdf.length, sha256: hash(pdf), items }, null, 2));
  for (const item of items) check('pdf_contains_' + item.value, item.present);
  for (const internal of ['计薪口径快照', '社保扣除月份快照', '累计个税计算快照']) check('no_internal_' + internal, !normalized.includes(internal));
  check('component_key_not_printed_in_place_of_name', !/(?:^|\s)129(?:\s|$)/u.test(normalized));
  evidence.content = true;
} catch (error) { failure = error; }
finally {
  try { check('all_original_salary_rows_unchanged', hash(database('SELECT * FROM hr_salary_slip ORDER BY id')) === original); evidence.preservation = true; } catch (error) { failure ||= error; }
  try { console.log('D3_SALARY_PRESENTATION_LOG_SCAN: ' + JSON.stringify(await runtime.scan())); evidence.secrets = true; } catch (error) { failure ||= error; }
  await runtime.close();
  const raw = failure ? String(failure.message).split('\n')[0].slice(0, 220) : undefined;
  const safe = raw && [...sensitive].every(value => !raw.includes(value)) ? raw : failure ? 'Salary PDF validation failed' : undefined;
  fs.writeFileSync(path.join(output, 'requests.json'), JSON.stringify(requests, null, 2));
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ passed: !failure && Object.values(evidence).every(Boolean), ...evidence, checks, requests: requests.length, all18Complete: false, globalComplete: false, officialTaxPolicyVerified: false, failure: safe }, null, 2));
  console.log(`D3_SALARY_PRESENTATION_SUMMARY: checks=${checks.length}; failed=${failure ? 1 : 0}; requests=${requests.length}; preservation=${evidence.preservation}`);
  if (failure) { console.log('D3_SALARY_PRESENTATION_FAILURE: ' + safe); process.exitCode = 1; }
}
