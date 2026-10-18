import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

export async function verifyOpportunityImportCompatibility({ admin, api, successful, database, check, caseTag,
  evidence, definitions, upload, validate, execute, sql }) {
  const prefix = 'H3_COMPAT_' + caseTag + '_';
  const cases = [
    { type: 'HOLIDAY', row: { calendarId: 'G_IMPORT_CALENDAR', holidayDate: '2066-10-11', dateType: 'HOLIDAY',
      holidayName: prefix + 'holiday', triplePayFlag: '1', yearNo: '2066' },
    count: "SELECT COUNT(*) FROM sys_holiday_date WHERE tenant_id=100000 AND calendar_id=990000701 AND holiday_date='2066-10-11';" },
    { type: 'EMPLOYEE', row: { employeeNo: prefix + 'employee', name: '商机导入相邻员工', gender: 'MALE',
      deptId: database('SELECT dept_name FROM sys_dept WHERE tenant_id=100000 AND dept_id=100;'), hireDate: '2026-09-01' },
    count: 'SELECT COUNT(*) FROM hr_employee WHERE tenant_id=100000 AND employee_no=' + sql(prefix + 'employee') + ';' },
    { type: 'CUSTOMER', row: { customerCode: prefix + 'customer', customerName: '商机导入相邻客户',
      ownerId: 'G_IMPORT_OWNER', source: 'REFERRAL' },
    count: 'SELECT COUNT(*) FROM crm_customer WHERE tenant_id=100000 AND customer_code=' + sql(prefix + 'customer') + ';' },
    { type: 'SUPPLIER', row: { supplierCode: prefix + 'supplier', supplierName: '商机导入相邻供应商', categoryId: 'G_IMPORT_SUPPLIER',
      supplierType: 'SERVICE', creditCode: 'V' + caseTag.toUpperCase().padEnd(17, '0'), contactName: '隔离验证', contactPhone: '010-12345678',
      contactEmail: 'h3-import@example.test', registerCapital: '1000.00', registerDate: '2020-01-01', taxRate: '0.13', currency: 'CNY', status: 'ACTIVE' },
    count: 'SELECT COUNT(*) FROM oa_supplier WHERE tenant_id=100000 AND supplier_code=' + sql(prefix + 'supplier') + ';' },
    { type: 'ASSET', row: { assetCode: prefix + 'asset', name: '商机导入相邻资产', categoryId: 'G_IMPORT_ASSET',
      purchaseAmount: '6000.00', purchaseDate: '2026-09-01', salvageValue: '300.00', openingAccumulatedDepreciation: '0.00',
      depreciationFlag: '1', usefulLifeMonths: '36', availableFromDate: '2026-09-01', depreciationMethod: 'STRAIGHT_LINE', depreciationFrequency: 'MONTHLY' },
    count: 'SELECT COUNT(*) FROM oa_asset WHERE tenant_id=100000 AND asset_code=' + sql(prefix + 'asset') + ';' },
  ];
  for (const item of cases) {
    const definition = definitions.find(value => value.bizType === item.type);
    assert.ok(definition);
    check(item.type + '仍明确只支持新增', definition.supportsUpdates === false && definition.canDownloadUpdateTemplate === false
      && definition.instructions.some(line => line.includes('只新增')) && !definition.columns.some(column => column.field === 'operation'));
    const unsupported = await api(admin, '/' + definition.service + '/system/import/' + item.type + '/template?updates=true');
    check(item.type + '不能调用更新模板绕过原导入范围', unsupported.status === 400 || unsupported.body?.code === 400);
    const template = await api(admin, '/' + definition.service + '/system/import/' + item.type + '/template');
    check(item.type + '原新增模板仍为有效Excel下载', template.status === 200 && template.size > 1000 && template.disposition?.includes('.xlsx'));
    check(item.type + '导入前没有本次记录', database(item.count) === '0');
    const uploaded = await upload(admin, definition, [item.row], caseTag + '-legacy-' + item.type);
    const validated = await validate(admin, uploaded);
    check(item.type + '真实预校验通过且未写业务', validated.status === 'VALIDATED' && validated.validRows === 1
      && validated.invalidRows === 0 && database(item.count) === '0');
    const completed = await execute(admin, uploaded, false);
    check(item.type + '继续调用原业务服务新增一行', completed.status === 'SUCCESS' && completed.successRows === 1
      && completed.failRows === 0 && database(item.count) === '1');
    const original = await api(admin, '/' + definition.service + '/system/import/' + uploaded.task.taskId + '/file');
    check(item.type + '保存的原文件逐字节一致', original.sha256 === createHash('sha256').update(uploaded.content).digest('hex'));
    const duplicate = await upload(admin, definition, [item.row], caseTag + '-legacy-duplicate-' + item.type);
    const invalid = await validate(admin, duplicate);
    check(item.type + '已有唯一编号继续拒绝且未覆盖', invalid.status === 'VALIDATED' && invalid.validRows === 0
      && invalid.invalidRows === 1 && database(item.count) === '1');
  }
  check('原资产导入仍生成36期折旧计划', database('SELECT COUNT(*) FROM oa_asset_depreciation_schedule WHERE asset_id='
    + '(SELECT asset_id FROM oa_asset WHERE tenant_id=100000 AND asset_code=' + sql(prefix + 'asset') + ');') === '36');
  evidence.legacyCreateOnly = true;
}
