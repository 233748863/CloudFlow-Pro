import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export const contractFilePermissions = ['oa:contract:list', 'oa:contract-term:edit', 'oa:contract-term:confirm', 'oa:contract:sign'];

// An isolated zero-value, approved contract is admission input only. This suite
// exercises actual file upload, binding and download; it does not verify approval.
export async function verifyContractFileCapacity({ tenantAdmin, api, successful, database, check, caseTag,
  state, targetId, applyLimit, usage, physicalSnapshot, evidence }) {
  const marker = `h5_contract_${caseTag}`;
  const prefix = `${caseTag}-contract-capacity-`;
  const sql = value => `CONVERT(0x${Buffer.from(String(value)).toString('hex')} USING utf8mb4)`;
  const rows = statement => database(statement).split(/\r?\n/).filter(Boolean).map(row => JSON.parse(row));
  const files = () => rows(`SELECT JSON_OBJECT('id',file_id,'name',file_name,'path',file_path,'size',file_size,
    'type',file_type,'url',url,'owner',create_by,'deleted',deleted) FROM sys_file
    WHERE tenant_id=${targetId} AND file_name LIKE ${sql(prefix + '%')} ORDER BY file_id;`);
  const beforeUsage = usage(); const beforeFiles = await physicalSnapshot();
  let contractId; let termId; let ownerId; let failure;
  const definitions = [
    { kind: 'CONTRACT_EVIDENCE', suffix: 'evidence', route: () => `/oa/contract/terms/${termId}/evidence` },
    { kind: 'CONTRACT_SIGNED', suffix: 'signed', route: () => `/oa/contract/${contractId}/signed-file` },
  ];
  const bytes = (definition, phase) => Buffer.from(`%PDF-1.4\n${marker}:${definition.kind}:${phase}\n%%EOF\n`);
  const upload = (definition, phase) => api(tenantAdmin, definition.route(), { method: 'POST',
    file: { name: `${prefix}${definition.suffix}-${phase}.pdf`, type: 'application/pdf', content: bytes(definition, phase).toString('base64') } });
  const ownedPath = async file => {
    const definition = definitions.find(item => file.type === `OA_${item.kind}`); assert.ok(definition);
    assert.equal(file.owner, String(ownerId)); assert.equal(file.deleted, 0); assert.ok(!file.url);
    const root = await fs.realpath(path.join(state.run, 'profile/oa-private', definition.kind));
    assert.ok(root.startsWith(await fs.realpath(state.run) + path.sep));
    const target = await fs.realpath(file.path); assert.ok(target.startsWith(root + path.sep)); return target;
  };
  const contractSnapshot = () => database(`SELECT JSON_OBJECT('status',status,'version',version,'signed',signed_flag,
    'reference',signed_file_url,'ourTime',our_sign_time,'theirTime',counterparty_sign_time,'amount',amount,
    'progress',fulfilment_progress,'fulfilled',fulfilled_term_count,'total',total_term_count) FROM oa_contract
    WHERE tenant_id=${targetId} AND contract_id=${contractId} AND contract_no=${sql(marker)};`);
  const termSnapshot = () => database(`SELECT JSON_OBJECT('version',version,'fulfilled',fulfilled_flag,'date',fulfilled_date,
    'reference',evidence_file_url,'remark',evidence_remark,'actor',fulfilled_by) FROM oa_contract_fulfilment_term
    WHERE tenant_id=${targetId} AND term_id=${termId} AND contract_id=${contractId};`);
  const download = async (definition, phase) => {
    const response = await api(tenantAdmin, definition.route());
    check(`${phase}${definition.suffix}原文件从合同业务入口完整下载`, response.status === 200
      && response.size === bytes(definition, 'allowed').length
      && response.sha256 === createHash('sha256').update(bytes(definition, 'allowed')).digest('hex')
      && /no-store/.test(response.cacheControl || '') && response.nosniff === 'nosniff');
  };
  assert.equal(files().length, 0);
  assert.equal(database(`SELECT COUNT(*) FROM oa_contract WHERE tenant_id=${targetId} AND contract_no=${sql(marker)};`), '0');
  try {
    const info = successful(await api(tenantAdmin, '/auth/info'), '读取合同附件操作者');
    ownerId = info.user.userId; assert.ok(Number.isSafeInteger(ownerId) && ownerId > 0);
    // No customer, supplier, project, payment, workflow or scheduled reminder.
    database(`INSERT INTO oa_contract (tenant_id,contract_no,contract_name,counterparty_name,contract_type,
      amount,currency,owner_id,status,requires_fulfilment_flag,remark,create_by)
      VALUES (${targetId},${sql(marker)},${sql(marker)},${sql(marker)},'OTHER',0.00,'CNY',${ownerId},
      'APPROVED',0,${sql(marker)},${sql(marker)});`);
    contractId = Number(database(`SELECT contract_id FROM oa_contract WHERE tenant_id=${targetId} AND contract_no=${sql(marker)} AND create_by=${sql(marker)};`));
    assert.ok(Number.isSafeInteger(contractId) && contractId > 0);
    termId = successful(await api(tenantAdmin, '/oa/contract/terms', { method: 'POST', body: {
      contractId, termNo: 1, termCategory: 'OTHER', termContent: marker, requirement: marker,
      responsibleParty: 'OUR', responsibleId: ownerId, remark: marker,
    } }), '真实建立隔离合同条款');
    assert.ok(Number.isSafeInteger(termId) && termId > 0);
    await applyLimit(8);
    const accepted = new Map();
    for (const definition of definitions) {
      const uploaded = successful(await upload(definition, 'allowed'), `真实上传${definition.suffix}附件`);
      assert.equal(uploaded.reference, `oa-file:${definition.kind}:${uploaded.fileId}`);
      accepted.set(definition.kind, uploaded);
      const original = files().find(file => file.id === Number(uploaded.fileId)); assert.ok(original);
      check(`${definition.suffix}附件保存私有原字节`, (await fs.readFile(await ownedPath(original))).equals(bytes(definition, 'allowed')));
    }
    successful(await api(tenantAdmin, `/oa/contract/terms/${termId}/confirm`, { method: 'POST', body: {
      fulfilledDate: database('SELECT CURRENT_DATE;'), evidenceFileUrl: accepted.get('CONTRACT_EVIDENCE').reference, evidenceRemark: marker,
    } }), '真实绑定履约证据');
    successful(await api(tenantAdmin, `/oa/contract/${contractId}/sign`, { method: 'POST', body: {
      signMethod: 'SCAN', counterpartySignee: marker, counterpartySignTime: database("SELECT DATE_FORMAT(DATE_SUB(NOW(),INTERVAL 1 DAY),'%Y-%m-%d %H:%i:%s');"),
      signedFileUrl: accepted.get('CONTRACT_SIGNED').reference, signRemark: marker,
    } }), '通过真实签署入口绑定隔离文件');
    const contract = JSON.parse(contractSnapshot()); const term = JSON.parse(termSnapshot());
    check('两个原附件经真实业务入口绑定并计入共享容量', contract.signed === 1 && term.fulfilled === 1
      && contract.reference === accepted.get('CONTRACT_SIGNED').reference && term.reference === accepted.get('CONTRACT_EVIDENCE').reference
      && usage() === beforeUsage + files().reduce((sum, file) => sum + file.size, 0));
    for (const definition of definitions) await download(definition, '降额前');
    await applyLimit(1);
    const retained = JSON.stringify(files()); const retainedFiles = await physicalSnapshot();
    const savedContract = contractSnapshot(); const savedTerm = termSnapshot(); const savedUsage = usage();
    await new Promise(resolve => setTimeout(resolve, 5100));
    for (const definition of definitions) {
      const rejected = await upload(definition, 'denied');
      console.log(`H5_CONTRACT_FILE_CAPACITY: kind=${definition.kind}; http=${rejected.status}; code=${rejected.body?.code}; capacity_message=${/存储空间不足/.test(rejected.body?.msg || '')}`);
      check(`${definition.suffix}超额新增明确返回容量不足`, rejected.status === 409 && rejected.body?.code === 409 && /存储空间不足/.test(rejected.body?.msg || ''));
      await download(definition, '降额后');
    }
    check('合同超额拒绝保留原文件、业务引用、签署和履约版本', JSON.stringify(files()) === retained
      && JSON.stringify(await physicalSnapshot()) === JSON.stringify(retainedFiles)
      && contractSnapshot() === savedContract && termSnapshot() === savedTerm && usage() === savedUsage);
    check('合同容量用例未发起审批、客户业绩或付款', database(`SELECT COUNT(*) FROM wf_process_instance WHERE tenant_id=${targetId} AND business_key='CONTRACT:${contractId}';`) === '0'
      && database(`SELECT COUNT(*) FROM crm_deal_event WHERE tenant_id=${targetId} AND biz_type='CONTRACT' AND biz_id=${contractId};`) === '0'
      && database(`SELECT COUNT(*) FROM oa_contract_payment_schedule WHERE tenant_id=${targetId} AND contract_id=${contractId};`) === '0');
    evidence.storageContractFiles = true;
  } catch (error) { failure = error; throw error; }
  finally {
    const failures = [];
    try {
      const owned = files(); const paths = await Promise.all(owned.map(ownedPath));
      if (contractId) {
        assert.equal(database(`SELECT COUNT(*) FROM oa_contract WHERE tenant_id=${targetId} AND contract_id=${contractId}
          AND contract_no=${sql(marker)} AND create_by=${sql(marker)} AND amount=0 AND customer_id IS NULL
          AND supplier_id IS NULL AND project_id IS NULL AND instance_id IS NULL AND requires_fulfilment_flag=0;`), '1');
        assert.equal(database(`SELECT COUNT(*) FROM oa_contract_fulfilment_term WHERE tenant_id=${targetId} AND contract_id=${contractId}
          AND (term_no<>1 OR term_content<>${sql(marker)} OR remark<>${sql(marker)});`), '0');
        assert.equal(database(`SELECT COUNT(*) FROM wf_process_instance WHERE tenant_id=${targetId} AND business_key='CONTRACT:${contractId}';`), '0');
        assert.equal(database(`SELECT COUNT(*) FROM crm_deal_event WHERE tenant_id=${targetId} AND biz_type='CONTRACT' AND biz_id=${contractId};`), '0');
        assert.equal(database(`SELECT COUNT(*) FROM oa_contract_payment_schedule WHERE tenant_id=${targetId} AND contract_id=${contractId};`), '0');
        // Only isolated business inputs are removed. Trace and audit records remain.
        database(`START TRANSACTION;
          DELETE FROM oa_contract_fulfilment_term WHERE tenant_id=${targetId} AND contract_id=${contractId}
            AND term_no=1 AND term_content=${sql(marker)} AND remark=${sql(marker)};
          DELETE FROM oa_contract WHERE tenant_id=${targetId} AND contract_id=${contractId} AND contract_no=${sql(marker)}
            AND create_by=${sql(marker)} AND amount=0 AND customer_id IS NULL AND instance_id IS NULL;
          COMMIT;`);
        assert.equal(database(`SELECT COUNT(*) FROM oa_contract WHERE contract_id=${contractId};`), '0');
        assert.equal(database(`SELECT COUNT(*) FROM oa_contract_fulfilment_term WHERE contract_id=${contractId};`), '0');
      }
      for (let index = 0; index < owned.length; index++) {
        const file = owned[index];
        const definition = definitions.find(item => `OA_${item.kind}` === file.type);
        const reference = `oa-file:${definition.kind}:${file.id}`;
        assert.equal(database(`SELECT (SELECT COUNT(*) FROM oa_contract WHERE signed_file_url=${sql(reference)})
          +(SELECT COUNT(*) FROM oa_contract_fulfilment_term WHERE evidence_file_url=${sql(reference)});`), '0');
        database(`DELETE FROM sys_file WHERE tenant_id=${targetId} AND file_id=${file.id} AND file_name=${sql(file.name)}
          AND file_type=${sql(file.type)} AND create_by=${sql(ownerId)};`);
        assert.equal(database(`SELECT COUNT(*) FROM sys_file WHERE file_id=${file.id};`), '0');
        await fs.unlink(paths[index]);
      }
    } catch (error) { failures.push(error); }
    try { await applyLimit(1); } catch (error) { failures.push(error); }
    if (failures.length) throw new AggregateError([...(failure ? [failure] : []), ...failures], '合同附件容量验证清理不完整');
    check('隔离合同、条款及附件精确清理且原用量恢复', files().length === 0 && usage() === beforeUsage
      && JSON.stringify(beforeFiles) === JSON.stringify(await physicalSnapshot())
      && database(`SELECT COUNT(*) FROM oa_contract WHERE tenant_id=${targetId} AND contract_no=${sql(marker)};`) === '0');
    evidence.storageContractFilesCleanup = true;
  }
}
