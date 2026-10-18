import fs from 'node:fs/promises';
import path from 'node:path';
import { api, check, jsonRows, sqlText, registerLogMarker, logEvidence, directory, pause, requestMetadata } from './live-lib.mjs';

const overtime = '/hr/attendance/overtime-requests';

export function containsPayLogLeak(value, markers) {
  if (Array.isArray(value)) return value.some(item => containsPayLogLeak(item, markers));
  if (value && typeof value === 'object') {
    return Object.entries(value).some(([key, item]) => (
      ['hourlyRate', 'settlementAmount', 'hourlyRateCipher', 'settlementAmountCipher', 'hourly_rate_cipher', 'settlement_amount_cipher'].includes(key)
      && item != null && item !== '[REDACTED]') || containsPayLogLeak(item, markers));
  }
  if (typeof value !== 'string') return false;
  return markers.some(marker => value.includes(marker)) || /rejectedValue|rejected value\s*\[/i.test(value)
    || /"(?:hourlyRate|settlementAmount|hourlyRateCipher|settlementAmountCipher|hourly_rate_cipher|settlement_amount_cipher)"\s*:\s*(?:"(?!\[REDACTED\]")[^"]+"|[0-9])/.test(value);
}

export async function runPayPrivacy(context) {
  const { fixture, sessions, approvalActors, ok, call, note, save } = context;
  const state = fixture.payroll;
  check('PAY隐私验收使用真实已核价结算单', Boolean(state?.requestId) && fixture.completed['pay-settlement'] === true);
  const baseline = await ok('finance', `${overtime}/${state.requestId}/settlement`);
  const own = await ok('employee', `${overtime}/${state.requestId}/settlement`);
  check('本人授权详情可读真实核价金额', own.hourlyRate === baseline.hourlyRate && own.settlementAmount === baseline.settlementAmount);
  for (const actor of [approvalActors.reviewer, 'peer']) {
    const denied = await call(actor, `${overtime}/${state.requestId}/settlement`);
    check('HR工时权限及同租户他人均不能读取PAY金额', denied.status === 403 && [403, 'FORBIDDEN'].includes(denied.body?.code), { actor });
  }
  const marker = registerLogMarker('PAY核价及处置敏感正文');
  fixture.payPrivacy ||= { markers: [], traces: [] };
  fixture.payPrivacy.markers.push(marker);
  await save();
  const input = { version: baseline.version, payrollPeriodId: state.period.id, note: `${note} ${marker}` };
  const responses = [];
  for (const body of [{ ...input }, { ...input, hourlyRate: `${state.hourlyRate}1` }, { ...input, hourlyRate: marker }]) {
    const response = await call('finance', `${overtime}/${state.requestId}/review-pay`, 'POST', body);
    check('核价缺字段精度越界和格式错误均返回400', response.status === 400 && response.body?.code !== 200,
      { status: response.status, code: response.body?.code });
    responses.push(requestMetadata(response));
  }
  const malformed = await api(sessions.finance.page, `${overtime}/${state.requestId}/review-pay`, {
    method: 'POST', rawBody: `${JSON.stringify({ ...input, hourlyRate: state.hourlyRate }).slice(0, -1)},`,
  });
  check('核价格式错误JSON真实返回400', malformed.status === 400 && malformed.body?.code !== 200);
  responses.push(requestMetadata(malformed));
  const resolution = await call('finance', `${overtime}/${state.requestId}/settlement/resolve`, 'POST', {
    version: baseline.version, action: 'PAY_CORRECTION', originalSlipId: state.slipId, reason: `${note} ${marker}`,
  });
  check('补正处置缺少目标周期真实拒绝', resolution.status === 400 && resolution.body?.code !== 200);
  responses.push(requestMetadata(resolution));
  fixture.payPrivacy.traces.push(...responses.filter(row => row.traceId).map(row => row.traceId));
  await save();
  const after = await ok('finance', `${overtime}/${state.requestId}/settlement`);
  check('隐私异常请求不改变已结算金额来源和版本', after.version === baseline.version && after.compChangeId === baseline.compChangeId
    && after.hourlyRate === baseline.hourlyRate && after.settlementAmount === baseline.settlementAmount && after.settlementStatus === baseline.settlementStatus);
  await pause(1500);
  const traces = [...new Set(fixture.payPrivacy.traces)];
  check('真实异常请求具有可关联日志的追踪标识', traces.length >= 5);
  const errorLogs = jsonRows(`SELECT JSON_OBJECT('params',request_params,'message',exception_message,'stack',exception_stack)
    FROM sys_api_error_log WHERE tenant_id=100000 AND trace_id IN (${traces.map(sqlText).join(',')})`);
  const operations = jsonRows(`SELECT JSON_OBJECT('params',params,'exception',exception) FROM sys_log
    WHERE tenant_id=100000 AND (trace_id IN (${traces.map(sqlText).join(',')})
    OR request_url LIKE ${sqlText(`%/overtime-requests/${state.requestId}/%`)})`);
  const audits = jsonRows(`SELECT JSON_OBJECT('before',before_data,'after',after_data) FROM hr_audit_log
    WHERE tenant_id=100000 AND business_domain='HR_OVERTIME' AND business_id=${sqlText(state.requestId)}`);
  check('真实业务操作日志及加班审计存在', operations.length > 0 && audits.length > 0);
  for (const [source, values] of [['error', errorLogs], ['operation', operations], ['audit', audits]]) {
    check('持久日志及审计不含PAY正文或金额字段值', values.every(value => !containsPayLogLeak(value, fixture.payPrivacy.markers)), { source, rowCount: values.length });
  }
  const logDirectories = [directory, path.resolve(directory, '..', '..', 'logs'),
    path.resolve(directory, '..', '..', 'cloudflow-backend', 'logs'),
    path.resolve(directory, '..', '..', 'cloudflow-backend', 'cloudflow-service-hr', 'logs')];
  let scannedFiles = 0;
  for (const parent of logDirectories) {
    let entries;
    try { entries = await fs.readdir(parent, { withFileTypes: true }); }
    catch (error) { if (error.code === 'ENOENT') continue; throw new Error('H_HR_LOG_DIRECTORY_UNREADABLE'); }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.log') || entry.name.includes('.sql.')) continue;
      const text = await fs.readFile(path.join(parent, entry.name), 'utf8');
      check('应用日志不含本轮PAY敏感正文', !fixture.payPrivacy.markers.some(value => text.includes(value)), { file: entry.name });
      scannedFiles++;
    }
  }
  const browser = logEvidence();
  check('已检查实际应用日志且浏览器无PAY正文泄露', scannedFiles > 0 && browser.browserLeaks.length === 0);
  fixture.payPrivacy.evidence = { checkedAt: new Date().toISOString(), errorRows: errorLogs.length, operationRows: operations.length,
    auditRows: audits.length, scannedFiles, browserEvents: browser.browserEventsObserved, browserLeaks: browser.browserLeaks.length,
    privacyRequestCount: responses.length, correctionAppliedAuditCovered: false };
  fixture.completed['pay-log-privacy'] = true;
  await save();
}
