import React, { useRef, useState } from 'react';
import { BaseDialog, Button } from '@/components/common';
import { DetailFieldGrid } from '@/components/common/DetailDialog';
import { emailArchive, type CustomerEmail, type EmailFile } from '@/services/api/crm/emailArchive';
import { getErrorMessage } from '@/utils/errorMessage';
import { useAccess, useRemote } from '../operations/OperationsKit';
import { EmailBody, emailBusinessNames, EmailStatus } from './EmailBody';

export function EmailRecordDialog({ emailId, onClose, onEdit }: { emailId: number; onClose: () => void; onEdit?: (record: CustomerEmail) => void }) {
  const source = useRemote(() => emailArchive.detail(emailId), [emailId]);
  const can = useAccess();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const download = async (file: EmailFile) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const content = await emailArchive.attachment(emailId, file.fileId);
      const url = URL.createObjectURL(content);
      const link = document.createElement('a'); link.href = url; link.download = file.fileName; link.click(); URL.revokeObjectURL(url);
    } catch (failure) { setError(getErrorMessage(failure, '附件不可访问，请刷新业务权限后重试')); }
    finally { lock.current = false; setBusy(false); }
  };
  const record = source.data;
  return <BaseDialog open title="客户邮件详情" width="wide" onClose={onClose} footer={<Button variant="outline" onClick={onClose}>关闭邮件详情</Button>}>
    <div className="space-y-4">
      {(source.error || error) && <p role="alert" className="crm-ops-warning">{source.error || error}</p>}
      <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={source.loading} onClick={source.refresh}>刷新真实发送状态</Button>
        {record?.requestKey && record.sendStatus === 'DRAFT' && can('crm:email:send') && onEdit && <Button onClick={() => onEdit(record)}>继续编辑邮件草稿</Button>}</div>
      {source.loading && <p role="status">正在读取邮件归档…</p>}
      {record && <><h4 className="break-words font-semibold text-cf-title">{record.subject}</h4><EmailStatus value={record.sendStatus} />
        <DetailFieldGrid items={[
          { label: '往来方向', value: record.direction === 'INBOUND' ? '手工来信' : '向客户发信' }, { label: '所属业务', value: `${emailBusinessNames[record.bizType]} #${record.bizId}` },
          { label: '发件邮箱', value: record.fromAddress || '尚未确定，未发送' }, { label: '收件邮箱', value: record.toAddresses.join('、') },
          { label: '抄送邮箱', value: record.ccAddresses?.join('、') || '—' }, { label: '真实接纳时间', value: record.sendTime || '尚无真实发送记录' },
          { label: '录入人', value: record.createBy }, { label: '归档时间', value: record.createTime }, { label: '来源说明或备注', value: record.remark, wide: true },
        ]} />
        {record.sendStatus === 'UNKNOWN' && <p role="status" className="crm-ops-warning">发送结果未明：邮件可能已送达，系统不会自动重发，请先在消息中心核实。</p>}
        <EmailBody html={record.sanitizedContent || ''} />
        {record.direction === 'OUTBOUND' && <p className="text-sm text-cf-muted">{record.readFlag ? `首次观察到打开请求：${record.readTime || '时间未记录'}。` : '尚未观察到打开请求。'}打开观察不证明客户已阅读；缓存过期、邮件代理和图片拦截会影响观察结果。</p>}
        <section aria-label="客户邮件附件"><h4 className="mb-2 font-medium">私有附件（{record.attachmentCount}）</h4>
          {record.attachments?.length ? <ul className="space-y-2">{record.attachments.map(file => <li key={file.fileId}><Button variant="outline" disabled={busy} className="max-w-full whitespace-normal break-all" onClick={() => void download(file)}>{file.fileName}</Button></li>)}</ul> : <p className="text-sm text-cf-muted">无附件</p>}
        </section>
      </>}
    </div>
  </BaseDialog>;
}
