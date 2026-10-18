import assert from 'node:assert/strict';

// Compensation settings and tax tables are isolated prerequisites; wages, policy files and
// the settlement calculation below are created through their actual service interfaces.
export async function prepareSettlementWagePolicy({ admin, api, successful, database, check, marker, employeeId, settlementId, evidence, expectedAdditionalSources = [], prepareAdditionalSources }) {
  const literal = value => `CONVERT(UNHEX('${Buffer.from(String(value)).toString('hex')}') USING utf8mb4)`;
  const identifier = value => { const result = String(value); assert.match(result, /^[1-9]\d*$/); return result; };
  const root = `/hr/settlement/${settlementId}`;
  const read = async () => successful(await api(admin, root), '读取工资取样结算');
  const componentId = identifier(database("SELECT id FROM hr_comp_component WHERE tenant_id=100000 AND component_code='BASE' AND component_type='FIXED' AND status=1;"));
  const policyId = identifier(successful(await api(admin, '/hr/severance-rule', { method: 'POST', body: {
    ruleCode: `${marker}_policy`, ruleName: `${marker}_核定政策`, effectiveFrom: '2026-01-01', effectiveTo: null, salaryComponentIds: [componentId], averagingMonths: 12,
    serviceRounding: 'ACTUAL_MONTHS', socialMonthlySalary: null, baseCapMultiplier: null, maxCompensationMonths: null, noticeMonths: '0',
    leaveDailyDivisor: '21.75', leaveHoursPerDay: '8', leaveCashMultiplier: '1', remark: '仅供隔离结算来源验收的管理员政策',
    slabs: [{ sortNo: 0, minServiceYears: '0', maxServiceYears: null, calculationMode: 'FIXED', compensationMonths: '0.5' }],
  } }), '实际创建取样政策'));
  let current = await read();
  const review = { ruleId: policyId, sampling: { months: ['2026-01'], averagingMonths: '0.5', reason: '隔离政策逐单核定一月份，平均月份数为0.5' }, remark: marker };
  const unconfirmed = await api(admin, root, { method: 'PUT', body: { ...review, version: current.version } });
  check('保存时拒绝未核定政策且不更改草稿', unconfirmed.status === 400 && (await read()).version === current.version);
  const pdf = Buffer.from('%PDF-1.4\nsettlement-sampling-policy\n%%EOF\n');
  const uploaded = successful(await api(admin, `/hr/severance-rule/${policyId}/policy?version=0`, { method: 'POST', file: { name: `${marker}.pdf`, content: pdf.toString('base64'), type: 'application/pdf' } }), '实际上传取样政策私有文件');
  successful(await api(admin, `/hr/severance-rule/${policyId}/confirm`, { method: 'POST', body: { version: uploaded.version } }), '实际确认取样政策');
  await new Promise(resolve => setTimeout(resolve, 5100)); // Respect the real five-second duplicate-submit window after the rejected attempt.
  successful(await api(admin, root, { method: 'PUT', body: { ...review, version: current.version } }), '实际保存政策及本单月份');
  current = await read();
  const missing = successful(await api(admin, `${root}/calculate`, { method: 'POST', body: { version: current.version } }), '真实检查所选月份缺工资');
  check('已选月份没有工资时明确缺项且不把缺工资当零工资', missing.missingRequirements.some(message => message.includes('2026-01')) && !missing.items.some(item => item.itemType === 'SEVERANCE'));
  database(`INSERT INTO hr_comp_structure(tenant_id,structure_code,structure_name,component_config,status)
    VALUES(100000,${literal(marker)},${literal(marker)},JSON_OBJECT('payrollBasis',JSON_OBJECT('salaryBasis','MONTHLY','prorationBasis','CALENDAR_DAYS','benefitTiming','FIRST_PAYROLL')),1);`);
  const structureId = identifier(database(`SELECT id FROM hr_comp_structure WHERE tenant_id=100000 AND structure_code=${literal(marker)};`));
  database(`INSERT INTO hr_tax_slab(tenant_id,slab_name,region,effective_from,effective_to,threshold_amount,status)
    VALUES(100000,${literal(marker)},${literal(marker)},'2026-01-01','2026-12-31',500,'ACTIVE');`);
  const slabId = identifier(database(`SELECT slab_id FROM hr_tax_slab WHERE tenant_id=100000 AND slab_name=${literal(marker)};`));
  for (let level = 0; level < 7; level++) database(`INSERT INTO hr_tax_slab_detail(tenant_id,slab_id,level_no,from_amount,to_amount,tax_rate,quick_deduction)
    VALUES(100000,${slabId},${level + 1},${level * 100000},${level === 6 ? 'NULL' : (level + 1) * 100000},0.1,0);`);
  database(`INSERT INTO hr_tax_profile(tenant_id,employee_id,tax_slab_id,status) VALUES(100000,${employeeId},${slabId},'ACTIVE');`);
  successful(await api(admin, '/hr/compensation/employee-compensations', { method: 'POST', body: { employeeId, structureId, componentValues: { [componentId]: '10000.00' }, totalSalary: '10000.00', effectiveDate: '2026-01-01', status: 'ACTIVE' } }), '真实薪资接口加密保存固定月薪');
  successful(await api(admin, `/hr/ess/salary-slips/generate?periodMonth=2026-01&employeeId=${employeeId}`, { method: 'POST' }), '真实生成一月份封存工资');
  const slipId = identifier(database(`SELECT id FROM hr_salary_slip WHERE tenant_id=100000 AND employee_id=${employeeId} AND period_month='2026-01' AND deleted=0;`));
  const original = database(`SELECT CONCAT(version,':',digest_sha256,':',status,':',COALESCE(reserved_settlement_id,'NULL')) FROM hr_salary_slip WHERE tenant_id=100000 AND id=${slipId};`);
  const additionalSources = [...expectedAdditionalSources, ...(prepareAdditionalSources ? await prepareAdditionalSources() : [])];
  const calculated = successful(await api(admin, `${root}/calculate`, { method: 'POST', body: { version: missing.version } }), '实际按本单选择汇集工资及补偿');
  const severance = calculated.items.find(item => item.itemType === 'SEVERANCE'); const wage = calculated.items.find(item => item.sourceBizType === 'HR_SALARY_SLIP');
  check('真实工资政策及指定组合来源齐备且缺项清空', calculated.missingRequirements.length === 0 && calculated.items.length === 2 + additionalSources.length
    && Boolean(severance) && String(wage?.sourceBizId) === slipId && additionalSources.every(expected => calculated.items.some(item =>
      item.sourceBizType === expected.type && String(item.sourceBizId) === expected.id && item.amount === expected.amount)));
  check('一万元工资按本单0.5分母及0.5固定补偿月数计算一万元补偿', severance.amount === '10000.00' && Number(severance.evidence.calculation.averageMonthlySalary) === 20000
    && severance.evidence.salarySampling.months.join(',') === '2026-01' && severance.evidence.salarySampling.averagingMonths === '0.5');
  check('取样计算保留真实政策文件和工资封存证据', String(severance.evidence.policy.policyFileId) === String(uploaded.policyFile.fileId)
    && severance.evidence.salarySampling.wages.some(value => String(value.salarySlipId) === slipId) && typeof wage.evidence.digestSha256 === 'string');
  check('草稿汇集不改写或冻结原工资', database(`SELECT CONCAT(version,':',digest_sha256,':',status,':',COALESCE(reserved_settlement_id,'NULL')) FROM hr_salary_slip WHERE tenant_id=100000 AND id=${slipId};`) === original);
  evidence.wagePolicy = true;
  return { policyId, slipId };
}
