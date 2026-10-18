import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// 前置员工关联属于隔离输入；申诉、询价和邮件草稿及附件关联均通过实际业务HTTP建立。
export function tenantPackageBoundFiles({ tenantAdmin, api, successful, database, check, caseTag, targetId,
  customerId, accepted, uploads, expectedBytes, evidence }) {
  const marker = `H5_BOUND_${caseTag}`;
  const sql = value => `CONVERT(0x${Buffer.from(String(value)).toString('hex')} USING utf8mb4)`;
  const find = service => {
    const file = accepted.find(item => item.name.includes(`-cross-${service}-`));
    assert.ok(file, `Accepted ${service} file required`);
    return file;
  };
  const hrFile = find('HR');
  const oaFile = find('OA');
  const crmFile = find('CRM');
  let grievanceId;
  let rfqId;
  let contactId;
  let emailId;
  let createdEmployeeId;
  const downloads = [];
  const businessSnapshot = () => JSON.stringify({
    hr: grievanceId ? database(`SELECT JSON_OBJECT('id',grievance_id,'status',status,'files',attachment_url,'version',version)
      FROM hr_grievance WHERE tenant_id=${targetId} AND grievance_id=${grievanceId};`) : null,
    oa: rfqId ? database(`SELECT JSON_OBJECT('id',rfq_id,'status',status,'files',attachment_url,'version',version)
      FROM oa_purchase_rfq WHERE tenant_id=${targetId} AND rfq_id=${rfqId};`) : null,
    crm: emailId ? database(`SELECT JSON_OBJECT('id',email_id,'status',send_status,'files',attachment_file_ids,'count',attachment_count,'updated',update_time,'updatedBy',update_by)
      FROM crm_email_record WHERE tenant_id=${targetId} AND email_id=${emailId};`) : null,
  });
  return {
    async bind() {
      check('本轮绑定业务唯一标记尚未使用', database(`SELECT
        (SELECT COUNT(*) FROM hr_grievance WHERE tenant_id=${targetId} AND subject=${sql(marker)})+
        (SELECT COUNT(*) FROM oa_purchase_rfq WHERE tenant_id=${targetId} AND title=${sql(marker)})+
        (SELECT COUNT(*) FROM crm_email_record WHERE tenant_id=${targetId} AND subject=${sql(marker)})+
        (SELECT COUNT(*) FROM crm_contact WHERE tenant_id=${targetId} AND contact_name=${sql(marker)})+
        (SELECT COUNT(*) FROM hr_employee WHERE tenant_id=${targetId} AND employee_no=${sql(marker)});`) === '0');
      const info = successful(await api(tenantAdmin, '/auth/info'), '读取本次真实业务附件操作者');
      const userId = info.user.userId;
      assert.equal(info.user.tenantId, targetId);
      const employeeIds = database(`SELECT id FROM hr_employee WHERE tenant_id=${targetId} AND user_id=${userId} AND deleted=0;`).split(/\r?\n/).filter(Boolean);
      assert.ok(employeeIds.length <= 1, 'Employee account must have a unique local binding');
      if (!employeeIds.length) {
        const deptId = Number(database(`SELECT dept_id FROM sys_user WHERE tenant_id=${targetId} AND user_id=${userId} AND deleted=0;`));
        assert.ok(Number.isSafeInteger(deptId) && deptId > 0);
        database(`INSERT INTO hr_employee (tenant_id,employee_no,name,gender,dept_id,employee_status,hire_date,user_id,deleted,create_by)
          VALUES (${targetId},${sql(marker)},${sql(marker)},'UNKNOWN',${deptId},'REGULAR','2020-01-01',${userId},0,${sql(marker)});`);
        createdEmployeeId = Number(database(`SELECT id FROM hr_employee WHERE tenant_id=${targetId} AND employee_no=${sql(marker)} AND user_id=${userId};`));
        assert.ok(Number.isSafeInteger(createdEmployeeId) && createdEmployeeId > 0);
      }
      grievanceId = successful(await api(tenantAdmin, '/hr/ess/grievances', { method: 'POST', body: {
        grievanceType: 'OTHER', subject: marker, description: '套餐降额后本人已提交附件仍可读取', againstType: 'NONE', priority: 'NORMAL', fileIds: [hrFile.id],
      } }), '真实提交本人申诉并绑定原上传附件');
      assert.ok(Number.isSafeInteger(grievanceId) && grievanceId > 0);
      const grievance = successful(await api(tenantAdmin, `/hr/ess/grievances/${grievanceId}`), '读取真实申诉附件关系');
      check('HR附件关联来自真实申诉提交', grievance.grievance.grievanceId === grievanceId
        && grievance.grievance.status === 'SUBMITTED' && JSON.parse(grievance.grievance.attachmentUrl).includes(hrFile.id));
      downloads.push({ service: 'HR', route: `/hr/ess/grievances/${grievanceId}/files/${hrFile.id}`, file: hrFile });

      const deadline = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
      const invitation = uploads.get('OA');
      assert.ok(typeof invitation?.reference === 'string' && invitation.reference.length > 0);
      rfqId = successful(await api(tenantAdmin, '/oa/rfq', { method: 'POST', body: {
        rfq: { title: marker, quoteDeadline: deadline, attachmentUrl: invitation.reference },
        items: [{ itemName: marker, quantity: 1, unit: '件', spec: '隔离附件降额验证' }],
      } }), '真实保存询价草稿并绑定原上传附件');
      assert.ok(Number.isSafeInteger(rfqId) && rfqId > 0);
      const rfq = successful(await api(tenantAdmin, `/oa/rfq/${rfqId}`), '读取真实询价附件关系');
      check('OA附件关联来自真实询价保存', rfq.rfq.rfqId === rfqId && rfq.rfq.attachmentUrl === invitation.reference);
      downloads.push({ service: 'OA', route: `/oa/rfq/${rfqId}/invitation-file`, file: oaFile });

      successful(await api(tenantAdmin, '/crm/contact', { method: 'POST', body: {
        customerId, contactName: marker, email: `${caseTag}@example.test`, status: 'ACTIVE',
      } }), '真实创建本次草稿客户联系人');
      contactId = Number(database(`SELECT contact_id FROM crm_contact WHERE tenant_id=${targetId} AND customer_id=${customerId} AND contact_name=${sql(marker)} AND deleted=0;`));
      assert.ok(Number.isSafeInteger(contactId) && contactId > 0);
      const draft = successful(await api(tenantAdmin, '/crm/email/draft', { method: 'POST', body: {
        requestKey: `${marker}_mail`, bizType: 'CUSTOMER', bizId: customerId, contactId,
        subject: marker, content: '<p>套餐降额附件验证草稿</p>', fileIds: [crmFile.id],
      } }), '真实保存客户邮件草稿并绑定原上传附件');
      emailId = draft.emailId;
      assert.ok(Number.isSafeInteger(emailId) && emailId > 0);
      const email = successful(await api(tenantAdmin, `/crm/email/${emailId}`), '读取真实邮件草稿附件关系');
      check('CRM草稿真实绑定原文件且保持未发送', draft.sendStatus === 'DRAFT' && email.sendStatus === 'DRAFT'
        && email.attachmentCount === 1 && email.attachments.some(file => file.fileId === crmFile.id));
      downloads.push({ service: 'CRM', route: `/crm/email/${emailId}/attachments/${crmFile.id}`, file: crmFile });
      check('三类实际业务均已建立附件关系', downloads.length === 3);
    },
    async verifyDownloads(phase) {
      assert.equal(downloads.length, 3);
      const before = businessSnapshot();
      for (const { service, route, file } of downloads) {
        const bytes = expectedBytes.get(file.name);
        assert.ok(Buffer.isBuffer(bytes));
        const response = await api(tenantAdmin, route);
        check(`${phase}${service}合法业务下载完整原始字节`, response.status === 200 && response.size === bytes.length
          && response.sha256 === createHash('sha256').update(bytes).digest('hex')
          && response.cacheControl === 'no-store' && response.nosniff === 'nosniff');
      }
      check(`${phase}合法下载不改变三类业务及附件关联`, before === businessSnapshot());
      check(`${phase}客户邮件仅为草稿且没有产生邮件投递`, database(`SELECT COUNT(*) FROM crm_email_record WHERE tenant_id=${targetId} AND email_id=${emailId} AND send_status='DRAFT' AND message_record_id IS NULL;`) === '1'
        && database(`SELECT COUNT(*) FROM sys_message_record WHERE tenant_id=${targetId} AND biz_type='CRM_EMAIL_ARCHIVE' AND biz_id='${emailId}';`) === '0');
      if (phase === '降额后') evidence.storageBoundDownloads = true;
    },
    async cleanup() {
      // 仅移除本轮明确编号及唯一标记的隔离业务输入，业务审计保留；不伪造结案或发送状态。
      if (grievanceId) {
        assert.equal(database(`SELECT COUNT(*) FROM hr_grievance WHERE tenant_id=${targetId} AND grievance_id=${grievanceId} AND subject=${sql(marker)};`), '1');
        database(`START TRANSACTION;
          DELETE FROM hr_grievance_record WHERE tenant_id=${targetId} AND grievance_id=${grievanceId};
          DELETE FROM hr_grievance WHERE tenant_id=${targetId} AND grievance_id=${grievanceId} AND subject=${sql(marker)};
          COMMIT;`);
      }
      if (rfqId) {
        assert.equal(database(`SELECT COUNT(*) FROM oa_purchase_rfq WHERE tenant_id=${targetId} AND rfq_id=${rfqId} AND title=${sql(marker)};`), '1');
        assert.equal(database(`SELECT COUNT(*) FROM oa_purchase_rfq_supplier WHERE tenant_id=${targetId} AND rfq_id=${rfqId};`), '0');
        database(`START TRANSACTION;
          DELETE FROM oa_purchase_rfq_item WHERE tenant_id=${targetId} AND rfq_id=${rfqId};
          DELETE FROM oa_purchase_rfq WHERE tenant_id=${targetId} AND rfq_id=${rfqId} AND title=${sql(marker)};
          COMMIT;`);
      }
      if (emailId) {
        assert.equal(database(`SELECT COUNT(*) FROM crm_email_record WHERE tenant_id=${targetId} AND email_id=${emailId} AND subject=${sql(marker)} AND send_status='DRAFT' AND message_record_id IS NULL;`), '1');
        database(`DELETE FROM crm_email_record WHERE tenant_id=${targetId} AND email_id=${emailId} AND subject=${sql(marker)} AND send_status='DRAFT' AND message_record_id IS NULL;`);
      }
      if (contactId) database(`DELETE FROM crm_contact WHERE tenant_id=${targetId} AND contact_id=${contactId} AND customer_id=${customerId} AND contact_name=${sql(marker)};`);
      if (createdEmployeeId) database(`DELETE FROM hr_employee WHERE tenant_id=${targetId} AND id=${createdEmployeeId} AND employee_no=${sql(marker)} AND create_by=${sql(marker)};`);
      check('本轮附件业务关系及临时员工关联已清理', database(`SELECT
        (SELECT COUNT(*) FROM hr_grievance WHERE tenant_id=${targetId} AND subject=${sql(marker)})+
        (SELECT COUNT(*) FROM oa_purchase_rfq WHERE tenant_id=${targetId} AND title=${sql(marker)})+
        (SELECT COUNT(*) FROM crm_email_record WHERE tenant_id=${targetId} AND subject=${sql(marker)})+
        (SELECT COUNT(*) FROM crm_contact WHERE tenant_id=${targetId} AND contact_name=${sql(marker)})+
        (SELECT COUNT(*) FROM hr_employee WHERE tenant_id=${targetId} AND employee_no=${sql(marker)});`) === '0');
      evidence.storageBoundCleanup = true;
    },
  };
}
