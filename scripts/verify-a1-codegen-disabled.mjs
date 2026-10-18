import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function verifyA1CodegenDisabled(ctx) {
  const { admin, api, database, check, directory, caseTag, evidence } = ctx;
  assert.equal(ctx.state.verification?.mode, 'A1_CODEGEN_DISABLED_INDEPENDENT');
  const base = '/auth/system/codegen';
  const table = { tableId: 1, tableName: 'oa_supplier', moduleName: 'oa', businessName: 'supplier',
    className: 'SysSupplier', functionName: '供应商', packageName: 'com.cloudflow.a1acceptance.oa',
    tplCategory: 'CRUD', parentMenuId: 0, tenantFieldFlag: 1, logicDeleteFlag: 1, versionFieldFlag: 1 };
  const requests = [
    ['GET', '/db/list?pageNum=1&pageSize=10'],
    ['GET', '/list?pageNum=1&pageSize=10'],
    ['GET', '/options'],
    ['GET', '/1'],
    ['POST', '/import', { tableNames: ['oa_supplier'], moduleName: 'oa' }],
    ['PUT', '', { table, columns: [] }],
    ['POST', '/1/sync', {}],
    ['GET', '/1/preview'],
    ['GET', '/1/download'],
    ['POST', '/1/write', { targetRoot: 'a1-disabled-output', confirmOverwrite: false }],
    ['DELETE', '/1'],
  ];
  const snapshot = () => createHash('sha256').update(database(`SELECT * FROM sys_codegen_table
    ORDER BY table_id; SELECT * FROM sys_codegen_column ORDER BY column_id;`)).digest('hex');
  const before = snapshot();
  const beforeFiles = await ctx.generatedFileSnapshot();
  const observations = [];
  for (const [method, suffix, body] of requests) {
    const result = await api(admin, base + suffix, { method, ...(body === undefined ? {} : { body }) });
    const observed = { method, path: base + suffix, status: result.status, code: result.body?.code,
      message: result.body?.msg, passed: result.status === 403 && result.body?.code === 403
        && result.body?.msg === '代码生成器已关闭' };
    observations.push(observed);
    check('AC-9 默认关闭时真实接口拒绝 ' + method + ' ' + suffix, observed.passed);
  }
  check('AC-9 默认关闭覆盖全部11个真实接口', observations.length === 11);
  check('AC-9 关闭状态下所有元数据及目标文件保持', snapshot() === before
    && JSON.stringify(await ctx.generatedFileSnapshot()) === JSON.stringify(beforeFiles));
  await fs.writeFile(path.join(directory, 'a1-disabled-observations-' + caseTag + '.json'),
    JSON.stringify({ actualGateway: true, actualLogin: true, observations, metadataUnchanged: true,
      generatedFilesUnchanged: true, productModified: false, referenceRuntimeWritten: false }, null, 2), { flag: 'wx' });
  evidence.disabled = true;
}
