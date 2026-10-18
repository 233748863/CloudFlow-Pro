import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export const previewSql = value => `CONVERT(UNHEX('${Buffer.from(String(value)).toString('hex')}') USING utf8mb4)`;
export const previewDigest = bytes => createHash('sha256').update(bytes).digest('hex');
export const previewPause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

export function previewPdf(marker) {
  const escaped = marker.replace(/([\\()])/g, '\\$1');
  const first = 'BT /F1 18 Tf 50 740 Td (Preview First Hit) Tj 0 -600 Td (Preview Second Hit) Tj ET';
  const second = `BT /F1 18 Tf 50 740 Td (Preview Third Hit) Tj 0 -40 Td (${escaped}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R /OpenAction 8 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R /Annots [9 0 R] >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(first)} >>\nstream\n${first}\nendstream`,
    `<< /Length ${Buffer.byteLength(second)} >>\nstream\n${second}\nendstream`,
    '<< /Type /Action /S /JavaScript /JS (app.alert\(\"PREVIEW_SCRIPT_MUST_NOT_RUN\"\)) >>',
    '<< /Type /Annot /Subtype /Link /Rect [50 710 300 755] /A << /S /URI /URI (https://preview-guard.example.invalid/not-requested) >> >>',
  ];
  let content = '%PDF-1.7\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(content));
    content += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const crossReference = Buffer.byteLength(content);
  content += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  content += offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  content += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${crossReference}\n%%EOF\n`;
  return Buffer.from(content);
}

export async function createPreviewFixtures(context) {
  const { api, successful, session, database, check, directory, caseTag, admin } = context;
  const roles = [];
  const people = [];
  const grantsSql = "SELECT CONCAT(tenant_id,':',role_id,':',menu_id) FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;";
  const grantsBefore = database(grantsSql);
  const employeeSql = 'SELECT CONCAT(tenant_id,\':\',menu_id) FROM sys_role_menu WHERE role_id=5 ORDER BY tenant_id,menu_id;';
  const employeeBefore = database(employeeSql);
  const scalar = statement => { const result = database(statement); assert.match(result, /^[1-9]\d*$/); return result; };
  const permissions = ['system:auth:info', 'system:auth:router', 'system:auth:logout', 'system:lookup:read', 'system:message:mine:list',
    'workflow:task:count', 'oa:workplace:view', 'oa:schedule:list', 'workflow:process:mine', 'workflow:task:todo',
    'workflow:task:statistics', 'workflow:copy:list', 'oa:announcement:list', 'system:file:list', 'system:file:upload',
    'system:file:preview', 'oa:contract:list', 'oa:license:list', 'oa:knowledge:list', 'oa:expense:list', 'oa:invoice:list',
    'oa:supplier:list', 'hr:recruitment:list', 'system:dept:list', 'hr:organization:list', 'oa:meeting-room:list',
    'workflow:process:view', 'workflow:process:start', 'oa:contract:sign', 'oa:contract-term:confirm'];
  const selected = database(`SELECT DISTINCT perms FROM sys_menu WHERE perms IN (${permissions.map(previewSql).join(',')}) ORDER BY perms;`).split(/\r?\n/);
  assert.deepEqual(selected, [...permissions].sort(), 'Every preview fixture permission must refer to a real menu');
  const menuIds = database(`WITH RECURSIVE navigation AS (
    SELECT menu_id,parent_id,menu_type FROM sys_menu WHERE perms IN (${permissions.map(previewSql).join(',')})
    UNION DISTINCT SELECT parent.menu_id,parent.parent_id,parent.menu_type FROM sys_menu parent JOIN navigation child ON parent.menu_id=child.parent_id
  ) SELECT menu_id FROM navigation ORDER BY menu_id;`).split(/\r?\n/);
  const createRole = (suffix, tenantId = 100000) => {
    const name = `h5p_${suffix}_${caseTag}`;
    const roleId = scalar(`INSERT INTO sys_role (tenant_id,role_name,role_key,role_sort,data_scope,ds_type,status,deleted)
      VALUES (${tenantId},${previewSql(name)},${previewSql(name)},999,'2',4,'0',0); SELECT LAST_INSERT_ID();`);
    roles.push(roleId);
    database(`INSERT INTO sys_role_menu (tenant_id,role_id,menu_id) SELECT ${tenantId},${roleId},menu_id FROM sys_menu WHERE menu_id IN (${menuIds.join(',')});`);
    return roleId;
  };
  const createPerson = (suffix, roleId, tenantId = 100000) => {
    const username = `h5p_${suffix}_${caseTag}`;
    const source = tenantId === 100000 ? 'g_holiday_employee' : 'g_import_tenant';
    const userId = scalar(`INSERT INTO sys_user (tenant_id,dept_id,user_name,nick_name,avatar,password,status,deleted,pwd_reset_required,create_by)
      SELECT tenant_id,dept_id,${previewSql(username)},${previewSql(username)},'/icon.svg',password,'0',0,'0','file-preview-fixture'
      FROM sys_user WHERE tenant_id=${tenantId} AND user_name=${previewSql(source)}; SELECT LAST_INSERT_ID();`);
    database(`INSERT INTO sys_user_role (tenant_id,user_id,role_id) VALUES (${tenantId},${userId},${roleId});`);
    const person = { username, userId, roleId, tenantId, deptId: tenantId === 100000 ? 100 : 990000101, source };
    people.push(person);
    return person;
  };
  const restore = () => {
    if (roles.length) database(`DELETE FROM sys_role_menu WHERE role_id IN (${roles.join(',')});
      DELETE FROM sys_user_role WHERE role_id IN (${roles.join(',')}); DELETE FROM sys_role WHERE role_id IN (${roles.join(',')});`);
    if (people.length) database(`DELETE FROM sys_user_role WHERE user_id IN (${people.map(person => person.userId).join(',')});
      UPDATE sys_user SET status='1' WHERE user_id IN (${people.map(person => person.userId).join(',')}) AND create_by='file-preview-fixture';`);
    check('预览专项结束后原有角色逐行恢复，正式EMPLOYEE授权完全不变', database(grantsSql) === grantsBefore && database(employeeSql) === employeeBefore);
  };
  try {
    const roleId = createRole('main');
    const person = createPerson('own', roleId);
    const peerPerson = createPerson('peer', roleId);
    const foreignPerson = createPerson('foreign', createRole('foreign', 100001), 100001);
    const employeePerson = createPerson('employee', 5);
    const revokePerson = createPerson('revoke', createRole('revoke'));
    const ratePerson = createPerson('rate', createRole('rate'));
    const sessionPerson = createPerson('session', roleId);
    const actor = await session(person.username, person.source);
    const confidential = `FILE_CONFIDENTIAL_${caseTag}`;
    const pdf = previewPdf(confidential);
    const images = await actor.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 1200; canvas.height = 700;
      const drawing = canvas.getContext('2d');
      drawing.fillStyle = '#314755'; drawing.fillRect(0, 0, 1200, 700);
      drawing.fillStyle = '#d9a45b'; drawing.fillRect(0, 0, 600, 350);
      drawing.fillStyle = '#82ac91'; drawing.fillRect(600, 350, 600, 350);
      drawing.fillStyle = '#ffffff'; drawing.font = '48px sans-serif'; drawing.fillText('CloudFlow Preview', 60, 170);
      return Object.fromEntries(['png', 'jpeg', 'webp'].map(format => [format, canvas.toDataURL(`image/${format}`).split(',')[1]]));
    });
    images.gif = 'R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
    const uploads = [];
    const lastUploads = new WeakMap();
    const uploadRaw = async (page, suffix, bytes, type, route = '/auth/system/file/upload') => {
      const previous = lastUploads.get(page) || new Map();
      const routePath = route.split('?')[0];
      const delay = (previous.get(routePath) || 0) + 5100 - Date.now();
      if (delay > 0) await previewPause(delay);
      const fileName = `h5p_${caseTag}_${suffix}`;
      try { return await api(page, route, { method: 'POST', file: { name: fileName, type, content: bytes.toString('base64') } }); }
      finally { previous.set(routePath, Date.now()); lastUploads.set(page, previous); }
    };
    const upload = async (page, suffix, bytes = pdf, type = 'application/pdf', route = '/auth/system/file/upload') => {
      const fileName = `h5p_${caseTag}_${suffix}`;
      const record = successful(await uploadRaw(page, suffix, bytes, type, route), `真实上传预览附件 ${suffix}`);
      assert.match(String(record.fileId), /^[1-9]\d*$/);
      const file = { id: String(record.fileId), name: record.fileName || fileName, reference: record.reference || record.url,
        bytes, digest: previewDigest(bytes), mediaType: type, record };
      uploads.push(file);
      return file;
    };
    const fixture = { actor, person, peerPerson, foreignPerson, employeePerson, revokePerson, ratePerson, sessionPerson, menuIds, confidential, pdf, images,
      upload, uploadRaw, uploads, restore, scalar, roles, people };
    if (process.argv.includes('--file-preview-workflow-only')) return { ...fixture, files: {}, cases: [], records: {} };
    const files = {};
    for (const name of ['public', 'contract', 'archive', 'knowledge', 'history', 'expense', 'invoice', 'resume', 'qualification']) {
      files[name] = await upload(actor, `${name}.pdf`);
    }
    files.license = await upload(actor, 'license.png', Buffer.from(images.png, 'base64'), 'image/png');
    const prefix = `H5P_${caseTag}`;
    const contractId = scalar(`INSERT INTO oa_contract (tenant_id,dept_id,owner_id,contract_no,contract_name,counterparty_name,contract_type,status,attachment_url,archive_attachment_url,create_by)
      VALUES (100000,${person.deptId},${person.userId},${previewSql(prefix)},${previewSql(prefix)},'隔离预览客户','SALES','DRAFT',${previewSql(files.contract.reference)},${previewSql(files.archive.reference)},${previewSql(person.username)}); SELECT LAST_INSERT_ID();`);
    const licenseId = scalar(`INSERT INTO oa_license (tenant_id,license_code,license_name,license_type,keeper_id,attachment_url,create_by)
      VALUES (100000,${previewSql(prefix)},${previewSql(prefix)},'OTHER',${person.userId},${previewSql(files.license.reference)},${previewSql(person.username)}); SELECT LAST_INSERT_ID();`);
    const knowledgeId = scalar(`INSERT INTO oa_knowledge_document (tenant_id,title,category,content,attachment_url,scope_type,status,submitter_id,dept_id,create_by)
      VALUES (100000,${previewSql(prefix)},'其他','隔离预览内容',${previewSql(files.knowledge.reference)},'ALL','DRAFT',${person.userId},${person.deptId},${previewSql(person.username)}); SELECT LAST_INSERT_ID();`);
    const versionId = scalar(`INSERT INTO oa_knowledge_doc_version (tenant_id,document_id,version_no,title,content,attachment_url,create_by)
      VALUES (100000,${knowledgeId},1,${previewSql(prefix)},'隔离历史内容',${previewSql(files.history.reference)},${previewSql(person.username)}); SELECT LAST_INSERT_ID();`);
    const claimId = scalar(`INSERT INTO biz_expense_claim (tenant_id,user_id,user_name,claim_no,category,total_amount,dept_id,create_by)
      VALUES (100000,${person.userId},${previewSql(person.username)},${previewSql(prefix)},'OTHER',1,${person.deptId},${previewSql(person.username)}); SELECT LAST_INSERT_ID();`);
    const itemId = scalar(`INSERT INTO biz_expense_item (tenant_id,claim_id,expense_type,amount,expense_date,receipt_url)
      VALUES (100000,${claimId},'OTHER',1,CURDATE(),${previewSql(files.expense.reference)}); SELECT LAST_INSERT_ID();`);
    const invoiceId = scalar(`INSERT INTO oa_invoice (tenant_id,invoice_direction,invoice_code,invoice_no,gross_amount,image_url,create_by)
      VALUES (100000,'INPUT',${previewSql(prefix)},${previewSql(prefix)},1,${previewSql(files.invoice.reference)},${previewSql(person.username)}); SELECT LAST_INSERT_ID();`);
    const candidateId = scalar(`INSERT INTO hr_candidate (tenant_id,candidate_no,name,resume_attachment_urls,create_by)
      VALUES (100000,${previewSql(prefix)},${previewSql(prefix)},JSON_ARRAY(${previewSql(files.resume.reference)}),${previewSql(person.username)}); SELECT LAST_INSERT_ID();`);
    const supplierId = scalar(`INSERT INTO oa_supplier (tenant_id,supplier_name,supplier_code,create_by)
      VALUES (100000,${previewSql(prefix)},${previewSql(prefix)},${previewSql(person.username)}); SELECT LAST_INSERT_ID();`);
    const qualificationId = scalar(`INSERT INTO oa_supplier_qualification (tenant_id,supplier_id,qualification_type,cert_name,file_url,create_by)
      VALUES (100000,${supplierId},'OTHER',${previewSql(prefix)},${previewSql(files.qualification.reference)},${previewSql(person.username)}); SELECT LAST_INSERT_ID();`);
    const termId = scalar(`INSERT INTO oa_contract_fulfilment_term (tenant_id,contract_id,term_no,term_content,responsible_party,responsible_id,create_by)
      VALUES (100000,${contractId},1,'隔离预览履约条款','OUR',${person.userId},${previewSql(person.username)}); SELECT LAST_INSERT_ID();`);
    files.signed = await upload(actor, 'signed.pdf', pdf, 'application/pdf', `/oa/contract/${contractId}/signed-file`);
    files.evidence = await upload(actor, 'evidence.pdf', pdf, 'application/pdf', `/oa/contract/terms/${termId}/evidence`);
    database(`UPDATE oa_contract SET signed_file_url=${previewSql(files.signed.reference)} WHERE contract_id=${contractId};
      UPDATE oa_contract_fulfilment_term SET evidence_file_url=${previewSql(files.evidence.reference)} WHERE term_id=${termId};`);
    const cases = [
      ['PUBLIC', 'public', {}], ['OA_CONTRACT', 'contract', { bizId: contractId, slot: 'attachment' }],
      ['OA_CONTRACT', 'archive', { bizId: contractId, slot: 'archive' }], ['OA_LICENSE', 'license', { bizId: licenseId }],
      ['OA_KNOWLEDGE', 'knowledge', { bizId: knowledgeId }], ['OA_KNOWLEDGE', 'history', { bizId: knowledgeId, versionNo: 1 }],
      ['OA_EXPENSE', 'expense', { bizId: claimId, childId: Number(itemId) }], ['OA_INVOICE', 'invoice', { bizId: invoiceId }],
      ['HR_RESUME', 'resume', { bizId: candidateId }],
      ['OA_SUPPLIER_QUALIFICATION', 'qualification', { bizId: supplierId, childId: Number(qualificationId) }],
      ['OA_CONTRACT_SIGNED', 'signed', { bizId: contractId }],
      ['OA_CONTRACT_EVIDENCE', 'evidence', { bizId: contractId, childId: Number(termId) }],
    ].map(([bizType, name, values]) => ({ name, file: files[name], request: { bizType, fileId: files[name].id, ...values } }));
    const records = { contractId, licenseId, knowledgeId, versionId, claimId, itemId, invoiceId, candidateId, supplierId, qualificationId, termId };
    await fs.writeFile(path.join(directory, `h5-preview-fixtures-${caseTag}.json`), JSON.stringify({ person, peerPerson, foreignPerson, records,
      files: Object.fromEntries(Object.entries(files).map(([name, file]) => [name, { id: file.id, name: file.name, reference: file.reference }])) }, null, 2));
    return { ...fixture, files, cases, records };
  } catch (failure) { restore(); throw failure; }
}
