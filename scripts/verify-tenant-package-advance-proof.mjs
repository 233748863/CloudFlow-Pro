import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export const advanceProofPermissions = ['hr:advance:repay', 'hr:advance:list'];

// The existing funded-loan fixture convention is used only as upload admission input.
// No payment, repayment, salary reservation or workflow is executed here.
export async function verifyAdvanceProofCapacity({ tenantAdmin, api, successful, database, check, caseTag,
  state, targetId, applyLimit, usage, physicalSnapshot, evidence }) {
  const marker = `h5_advance_${caseTag}`;
  const prefix = `${caseTag}-advance-capacity-`;
  const sql = value => `CONVERT(0x${Buffer.from(String(value)).toString('hex')} USING utf8mb4)`;
  const files = () => database(`SELECT JSON_OBJECT('id',file_id,'name',file_name,'path',file_path,'size',file_size,
    'business',biz_type,'businessId',biz_id,'type',file_type,'url',url,'deleted',deleted) FROM sys_file
    WHERE tenant_id=${targetId} AND file_name LIKE ${sql(prefix + '%')} ORDER BY file_id;`)
    .split(/\r?\n/).filter(Boolean).map(row => JSON.parse(row));
  const beforeUsage = usage(); const beforeFiles = await physicalSnapshot();
  let employeeId; let advanceId; let paymentMarker; let failure;
  const identifier = query => { const value = database(query); assert.match(value, /^[1-9][0-9]*$/); return value; };
  const bytes = phase => Buffer.from(`%PDF-1.4\n${marker}:${phase}\n%%EOF\n`);
  const upload = phase => api(tenantAdmin, `/hr/advance/${advanceId}/proof`, { method: 'POST',
    file: { name: `${prefix}${phase}.pdf`, type: 'application/pdf', content: bytes(phase).toString('base64') } });
  const ownedPath = async file => {
    assert.equal(file.type, 'HR_ADVANCE_PROOF'); assert.equal(file.business, 'HR_ADVANCE_PROOF');
    assert.equal(file.businessId, advanceId); assert.equal(file.deleted, 0); assert.ok(!file.url);
    const root = await fs.realpath(path.join(state.run, 'hr/private-files'));
    const target = await fs.realpath(file.path); assert.ok(target.startsWith(root + path.sep)); return target;
  };
  const loanSnapshot = () => database(`SELECT JSON_OBJECT('amount',advance_amount,'outstanding',outstanding_amount,
    'repaid',repaid_amount,'reserved',reserved_amount,'writtenOff',written_off_amount,'status',status,'version',version,
    'payment',payment_request_id,'paid',paid_time) FROM hr_employee_advance
    WHERE tenant_id=${targetId} AND advance_id=${advanceId} AND advance_no=${sql(marker)};`);
  const download = async (phase, fileId) => {
    const response = await api(tenantAdmin, `/hr/advance/${advanceId}/proof/${fileId}`);
    check(`${phase}借款原凭据经业务入口完整下载`, response.status === 200 && response.size === bytes('allowed').length
      && response.sha256 === createHash('sha256').update(bytes('allowed')).digest('hex')
      && /no-store/.test(response.cacheControl || '') && response.nosniff === 'nosniff');
  };
  assert.equal(files().length, 0);
  assert.equal(database(`SELECT COUNT(*) FROM hr_employee WHERE tenant_id=${targetId} AND employee_no=${sql(marker)};`), '0');
  try {
    database(`INSERT INTO hr_employee (tenant_id,employee_no,name,gender,employee_status,hire_date,deleted,create_by)
      VALUES (${targetId},${sql(marker)},${sql(marker)},'UNKNOWN','REGULAR','2020-01-01',0,${sql(marker)});`);
    employeeId = identifier(`SELECT id FROM hr_employee WHERE tenant_id=${targetId} AND employee_no=${sql(marker)} AND create_by=${sql(marker)};`);
    paymentMarker = 2000000000000 + Number(employeeId) * 100;
    assert.ok(Number.isSafeInteger(paymentMarker));
    assert.equal(database(`SELECT COUNT(*) FROM biz_payment_request WHERE id=${paymentMarker};`), '0');
    database(`INSERT INTO hr_employee_advance (tenant_id,advance_no,employee_id,advance_amount,purpose,apply_date,repay_mode,
      repaid_amount,outstanding_amount,reserved_amount,written_off_amount,status,approval_status,payment_request_id,paid_time,create_by)
      VALUES (${targetId},${sql(marker)},${employeeId},100.00,${sql(marker)},'2026-06-01','LUMP_SUM',
      0,100.00,0,0,'PAID','APPROVED',${paymentMarker},'2026-06-01 10:00:00',${sql(marker)});`);
    advanceId = identifier(`SELECT advance_id FROM hr_employee_advance WHERE tenant_id=${targetId} AND advance_no=${sql(marker)} AND create_by=${sql(marker)};`);
    const loan = loanSnapshot(); assert.ok(loan);
    await applyLimit(8);
    const uploaded = successful(await upload('allowed'), '借款凭据真实上传并关联隔离来源');
    const original = files().find(file => file.id === Number(uploaded.fileId)); assert.ok(original);
    check('借款凭据原字节完整且计入租户容量', (await fs.readFile(await ownedPath(original))).equals(bytes('allowed'))
      && usage() === beforeUsage + original.size);
    await download('降额前', original.id);
    await applyLimit(1);
    const retained = JSON.stringify(files()); const retainedFiles = await physicalSnapshot();
    await new Promise(resolve => setTimeout(resolve, 5100));
    const rejected = await upload('denied');
    console.log(`H5_ADVANCE_PROOF_CAPACITY: http=${rejected.status}; code=${rejected.body?.code}; capacity_message=${/存储空间不足/.test(rejected.body?.msg || '')}`);
    check('借款凭据新增超额明确拒绝', rejected.status === 409 && rejected.body?.code === 409 && /存储空间不足/.test(rejected.body?.msg || ''));
    check('借款拒绝新增后原凭据和本金状态不变', retained === JSON.stringify(files()) && loanSnapshot() === loan
      && JSON.stringify(retainedFiles) === JSON.stringify(await physicalSnapshot()) && usage() === beforeUsage + original.size
      && database(`SELECT COUNT(*) FROM hr_advance_repayment WHERE advance_id=${advanceId};`) === '0');
    await download('降额后', original.id);
    evidence.storageAdvanceProof = true;
  } catch (error) { failure = error; throw error; }
  finally {
    const failures = [];
    try {
      const owned = files(); const paths = await Promise.all(owned.map(ownedPath));
      if (advanceId) {
        assert.equal(database(`SELECT COUNT(*) FROM hr_advance_repayment WHERE advance_id=${advanceId};`), '0');
        assert.equal(database(`SELECT COUNT(*) FROM biz_payment_request WHERE id=${paymentMarker};`), '0');
        for (let index = 0; index < owned.length; index++) {
          const file = owned[index];
          database(`DELETE FROM sys_file WHERE tenant_id=${targetId} AND file_id=${file.id} AND file_name=${sql(file.name)}
            AND biz_type='HR_ADVANCE_PROOF' AND biz_id=${sql(advanceId)};`);
          await fs.unlink(paths[index]);
        }
        database(`DELETE FROM hr_employee_advance WHERE tenant_id=${targetId} AND advance_id=${advanceId}
          AND advance_no=${sql(marker)} AND employee_id=${employeeId} AND payment_request_id=${paymentMarker}
          AND advance_amount=100.00 AND outstanding_amount=100.00 AND repaid_amount=0 AND reserved_amount=0
          AND written_off_amount=0 AND status='PAID' AND create_by=${sql(marker)};`);
        assert.equal(database(`SELECT COUNT(*) FROM hr_employee_advance WHERE advance_id=${advanceId};`), '0');
      }
      if (employeeId) database(`DELETE FROM hr_employee WHERE tenant_id=${targetId} AND id=${employeeId} AND employee_no=${sql(marker)} AND user_id IS NULL AND create_by=${sql(marker)};`);
    } catch (error) { failures.push(error); }
    try { await applyLimit(1); } catch (error) { failures.push(error); }
    if (failures.length) throw new AggregateError([...(failure ? [failure] : []), ...failures], '借款凭据容量测试清理不完整');
    check('隔离借款来源及凭据清理且原容量恢复', files().length === 0 && usage() === beforeUsage
      && JSON.stringify(beforeFiles) === JSON.stringify(await physicalSnapshot())
      && database(`SELECT COUNT(*) FROM hr_employee WHERE tenant_id=${targetId} AND employee_no=${sql(marker)};`) === '0');
    evidence.storageAdvanceProofCleanup = true;
  }
}
