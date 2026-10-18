import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { scanOwnedAuditLogs, scanSecretStream } from './portal-checks/scan-access-logs.mjs';

// Approval is an isolated admission fixture. Signing, private file storage and UI use real services.
export async function verifyOaSignMethods({ admin, api, successful, session, database, check, caseTag, state, accounts, evidence }) {
  const marker = `F4_SIGN_${caseTag}`;
  const sql = value => `CONVERT(0x${Buffer.from(String(value)).toString('hex')} USING utf8mb4)`;
  const rows = statement => database(statement).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const ownerId = database("SELECT user_id FROM sys_user WHERE tenant_id=100000 AND user_name='g_import_admin';");
  assert.match(ownerId, /^[1-9][0-9]*$/);
  const employee = await session('g_holiday_employee');
  const foreign = await session('g_import_tenant');
  const secrets = new Set(accounts.map(account => account.password).filter(Boolean));
  for (const page of [admin, employee, foreign]) {
    const token = await page.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
    assert.ok(token); secrets.add(token.replace(/^Bearer /, ''));
  }
  const grants = () => database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;');
  const originalGrants = grants(); const errors = [];
  admin.on('pageerror', error => errors.push(error.name));
  const methods = { OFFLINE: '线下签署', ESIGN: '电子签章', SCAN: '扫描件确认' };
  const yesterday = database("SELECT DATE_FORMAT(DATE_SUB(NOW(),INTERVAL 1 DAY),'%Y-%m-%d %H:%i:00');");
  const waitFor = async (read, accepted, label) => {
    const deadline = Date.now() + 30000;
    do { const value = await read(); if (accepted(value)) return value; await new Promise(resolve => setTimeout(resolve, 300)); } while (Date.now() < deadline);
    throw new Error(label);
  };
  for (const [method, label] of Object.entries(methods)) {
    const name = `${marker}_${method}`;
    assert.equal(database(`SELECT COUNT(*) FROM oa_contract WHERE tenant_id=100000 AND contract_no=${sql(name)};`), '0');
    database(`INSERT INTO oa_contract(tenant_id,contract_no,contract_name,counterparty_name,contract_type,amount,currency,
      owner_id,status,requires_fulfilment_flag,remark,create_by)
      VALUES(100000,${sql(name)},${sql(name)},${sql(name)},'OTHER',0.00,'CNY',${ownerId},'APPROVED',0,${sql(marker)},${sql(marker)});`);
    const id = database(`SELECT contract_id FROM oa_contract WHERE tenant_id=100000 AND contract_no=${sql(name)} AND create_by=${sql(marker)};`);
    assert.match(id, /^[1-9][0-9]*$/);
    const current = () => rows(`SELECT JSON_OBJECT('signed',signed_flag,'method',sign_method,'file',signed_file_url,'user',CAST(our_signee_id AS CHAR),
      'time',our_sign_time,'ip',our_sign_ip,'signee',counterparty_signee,'version',version) FROM oa_contract WHERE tenant_id=100000 AND contract_id=${id};`)[0];
    const content = Buffer.from(`%PDF-1.4\n${name}\n%%EOF\n`); const filename = `${name}.pdf`;
    const body = { signMethod: method, counterpartySignee: name, counterpartySignTime: yesterday,
      signRemark: marker, ourSignIp: '203.0.113.50', ourSigneeId: 999999999 };
    if (method === 'ESIGN') {
      await admin.setViewportSize({ width: 320, height: 1000 });
      await admin.goto(new URL('/office/contracts', admin.url()).href, { waitUntil: 'domcontentloaded' });
      await admin.getByPlaceholder('合同名称', { exact: true }).fill(name);
      const row = admin.getByRole('row').filter({ hasText: name }); await row.waitFor();
      await row.getByRole('button', { name: '查看详情', exact: true }).click();
      const detail = admin.getByRole('dialog', { name, exact: true }); await detail.waitFor();
      await detail.getByRole('button', { name: '登记签署', exact: true }).click();
      const editor = admin.getByRole('dialog', { name: '登记合同签署', exact: true }); await editor.waitFor();
      const select = editor.getByLabel('签署方式', { exact: true });
      await select.waitFor({ state: 'visible' });
      assert.deepEqual(await select.locator('option').evaluateAll(options => options.filter(option => option.value).map(option => option.value)), Object.keys(methods));
      await select.selectOption('ESIGN');
      await editor.getByLabel('对方签署人', { exact: true }).fill(name);
      await editor.getByLabel('对方签署时间', { exact: true }).fill(yesterday.replace(' ', 'T').slice(0, 16));
      await editor.getByLabel('备注', { exact: true }).fill(marker);
      await editor.getByLabel('签署文件（必传）', { exact: true }).setInputFiles({ name: filename, mimeType: 'application/pdf', buffer: content });
      await editor.getByText('已上传，随本次操作保存关联', { exact: true }).waitFor();
      for (const width of [1440, 375, 320]) {
        await admin.setViewportSize({ width, height: 1000 });
        await admin.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const bounds = await editor.getByRole('button', { name: '保存', exact: true }).boundingBox();
        const layout = { width, method: await select.inputValue(), signeeRetained: await editor.getByLabel('对方签署人', { exact: true }).inputValue() === name,
          noHorizontalOverflow: await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth), saveHeight: bounds?.height || 0 };
        console.log(`F4_SIGN_METHODS_LAYOUT: ${JSON.stringify(layout)}`);
        await admin.screenshot({ path: path.join(state.run, `${name}-${width}.png`), fullPage: true });
        check(`签署登记${width}px保留电子签章和已填内容`, layout.method === 'ESIGN' && layout.signeeRetained && layout.noHorizontalOverflow
          && layout.saveHeight >= (width < 640 ? 44 : 32));
      }
      await editor.getByRole('button', { name: '保存', exact: true }).click(); await editor.waitFor({ state: 'hidden' });
      await detail.getByText('签署方式：电子签章', { exact: true }).waitFor();
      await detail.getByRole('button', { name: '关闭', exact: true }).last().click();
      evidence.ui = true;
    } else {
      const upload = successful(await api(admin, `/oa/contract/${id}/signed-file`, { method: 'POST', file: {
        name: filename, type: 'application/pdf', content: content.toString('base64') } }), `${label}真实上传签署文件`);
      body.signedFileUrl = upload.reference;
      const denied = await api(employee, `/oa/contract/${id}/sign`, { method: 'POST', body });
      check(`${label}普通员工无权替合同签署`, denied.status === 403 && current().signed === 0);
      const result = successful(await api(admin, `/oa/contract/${id}/sign`, { method: 'POST', body }), `${label}真实登记签署`);
      check(`${label}本机来源地址明确取证待核实`, result.warning === true);
    }
    const signed = await waitFor(current, value => value.signed === 1, `${label}签署结果未保存`);
    check(`${label}方式、真实操作者和时间落库且伪造身份无效`, signed.method === method && signed.user === ownerId
      && Boolean(signed.time) && Boolean(signed.ip) && signed.ip !== body.ourSignIp && signed.signee === name);
    const auditCount = () => database(`SELECT COUNT(*) FROM sys_audit_log WHERE tenant_id=100000 AND biz_module='oa'
      AND audit_name='合同签署留痕' AND audit_field='CONTRACT_SIGNED' AND high_risk=1
      AND JSON_UNQUOTE(JSON_EXTRACT(after_json,'$.contractId'))=${sql(id)}
      AND JSON_UNQUOTE(JSON_EXTRACT(after_json,'$.operatorId'))=${sql(ownerId)};`);
    check(`${label}实际保存一笔可定位合同和操作者的高风险审计`, auditCount() === '1');
    const ownFile = rows(`SELECT JSON_OBJECT('id',file_id,'path',file_path,'size',file_size) FROM sys_file WHERE tenant_id=100000 AND file_name=${sql(filename)} AND deleted=0;`);
    assert.equal(ownFile.length, 1);
    assert.equal(signed.file, `oa-file:CONTRACT_SIGNED:${ownFile[0].id}`);
    const storage = await fs.realpath(path.join(state.run, 'profile/oa-private/CONTRACT_SIGNED'));
    const target = await fs.realpath(ownFile[0].path); assert.ok(target.startsWith(storage + path.sep));
    assert.ok((await fs.readFile(target)).equals(content));
    const download = await api(admin, `/oa/contract/${id}/signed-file`);
    check(`${label}签署文件完整下载`, download.status === 200 && download.size === content.length
      && download.sha256 === createHash('sha256').update(content).digest('hex'));
    const foreignFile = await api(foreign, `/oa/contract/${id}/signed-file`);
    check(`${label}跨租户不能下载签署文件`, foreignFile.status === 404 && foreignFile.body?.code === 404
      && foreignFile.body?.msg === '记录不存在或无权访问' && foreignFile.body?.data == null && foreignFile.size == null);
    await new Promise(resolve => setTimeout(resolve, 5100));
    const repeated = await api(admin, `/oa/contract/${id}/sign`, { method: 'POST', body: { ...body, signedFileUrl: signed.file, signRemark: `${marker}_overwrite` } });
    check(`${label}已签署记录不能覆盖`, repeated.status === 409 && repeated.body?.code === 409 && repeated.body?.msg === '合同已签署，签署记录不能覆盖'
      && JSON.stringify(current()) === JSON.stringify(signed) && auditCount() === '1');
    evidence[method] = true;
  }
  check('三种签署未改变授权且浏览器运行异常为零', originalGrants === grants() && errors.length === 0);
  let count = 0; let bytes = 0; let leaks = 0;
  for (const service of state.services) {
    const root = path.join(state.run, service.name);
    const names = await fs.readdir(path.join(root, 'logs')).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
    for (const file of ['stdout.log', 'stderr.log', ...names.filter(name => name.endsWith('.log')).map(name => path.join('logs', name))]) {
      const scan = await scanSecretStream(createReadStream(path.join(root, file)), [...secrets]); count++; bytes += scan.bytes; leaks += scan.leaks;
    }
  }
  const audit = await scanOwnedAuditLogs(state, [...secrets], { log: '0', error: '0', audit: '0' });
  check('合同签署六服务及数据库日志无本次凭据泄漏', leaks === 0 && audit.leaks === 0); evidence.secrets = true;
  console.log(`F4_SIGN_METHODS_SECRET_SCAN: files=${count}; bytes=${bytes}; values=${secrets.size}; leaks=${leaks}; database_bytes=${audit.bytes}; database_leaks=${audit.leaks}`);
  console.log('F4_SIGN_METHODS_SCOPE: methods=3; real_signing=true; approval_status_is_fixture=true; third_party_signature_calls=0; signed_records_files_and_audits_retained=true; production_modified=false');
}
