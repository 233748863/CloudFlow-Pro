import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { EmailPanel } from '@/components/crm/email/EmailPanel';
import { emailBusinessNames } from '@/components/crm/email/EmailBody';
import { BusinessPicker } from '@/components/crm/operations/BusinessPicker';
import { Field, OperationsPage, OpsSelect, useAccess } from '@/components/crm/operations/OperationsKit';
import type { EmailBusinessType } from '@/services/api/crm/emailArchive';

const permissions: Record<EmailBusinessType, string> = { CUSTOMER: 'crm:customer:list', OPPORTUNITY: 'crm:opportunity:list', QUOTE: 'crm:quote:list', TICKET: 'crm:ticket:list' };

export default function CrmEmailPage() {
  const hasPermission = useAccess();
  const [search] = useSearchParams();
  const allowed = Object.keys(permissions).filter(type => hasPermission(permissions[type as EmailBusinessType])) as EmailBusinessType[];
  const [bizType, setBizType] = useState<EmailBusinessType | ''>(() => allowed.includes(search.get('bizType') as EmailBusinessType) ? search.get('bizType') as EmailBusinessType : '');
  const [bizId, setBizId] = useState<number | undefined>(() => /^[1-9][0-9]*$/.test(search.get('bizId') || '') && Number.isSafeInteger(Number(search.get('bizId'))) ? Number(search.get('bizId')) : undefined);
  const [editing, setEditing] = useState(false);
  if (!hasPermission('crm:email:list')) return <p role="alert">无权查看客户邮件归档。</p>;
  return <OperationsPage title="客户邮件归档" description="按客户及业务权限留存往来正文、私有附件和真实发送状态。" filters={<fieldset disabled={editing} className="grid gap-4 md:grid-cols-2">
    <Field label="关联业务类型"><OpsSelect label="邮件业务类型" value={bizType} empty="全部业务" options={Object.fromEntries(allowed.map(type => [type, emailBusinessNames[type]]))} onChange={value => { setBizType(value as EmailBusinessType | ''); setBizId(undefined); }} /></Field>
    {bizType && <BusinessPicker key={bizType} type={bizType} value={bizId} label="邮件关联业务" onChange={setBizId} />}
    {!bizId && <p className="text-sm text-cf-muted md:col-span-2">先选择具体客户、商机、工单或报价，即可新建邮件或手工归档来信。</p>}
  </fieldset>}><EmailPanel key={`${bizType}:${bizId || ''}`} bizType={bizType || undefined} bizId={bizType ? bizId : undefined} onEditingChange={setEditing} /></OperationsPage>;
}
