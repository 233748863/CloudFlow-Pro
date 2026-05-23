import React from 'react';
import { DatePicker, Input, Textarea } from '@/components/common';
import { useCrmManagement } from '../store';
import { nativeSelectClassName } from '../constants';

export const FollowUpDialogContent: React.FC = () => {
  const { followUpForm, setFollowUpForm, customerOptions, opportunityOptions } = useCrmManagement();
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="md:col-span-2">
        <select
          aria-label="选择客户"
          className={nativeSelectClassName}
          value={followUpForm.customerId ? String(followUpForm.customerId) : ''}
          onChange={(e) => setFollowUpForm((prev) => ({ ...prev, customerId: Number(e.target.value) }))}
        >
          <option value="" disabled>选择客户</option>
          {customerOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </div>
      <div className="md:col-span-2">
        <select
          aria-label="关联商机"
          className={nativeSelectClassName}
          value={followUpForm.opportunityId ? String(followUpForm.opportunityId) : 'NONE'}
          onChange={(e) => setFollowUpForm((prev) => ({ ...prev, opportunityId: e.target.value === 'NONE' ? undefined : Number(e.target.value) }))}
        >
          <option value="NONE">不关联商机</option>
          {opportunityOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </div>
      <Textarea className="md:col-span-2" value={followUpForm.content || ''} onChange={(e) => setFollowUpForm((prev) => ({ ...prev, content: e.target.value }))} placeholder="跟进内容，例如：客户已确认报价范围，待内部审批。" />
      <Input value={followUpForm.ownerName || ''} onChange={(e) => setFollowUpForm((prev) => ({ ...prev, ownerName: e.target.value }))} placeholder="跟进人" />
      <DatePicker
        className="h-11"
        type="datetime-local"
        value={followUpForm.nextFollowUpTime ? String(followUpForm.nextFollowUpTime).slice(0, 16) : ''}
        onChange={(e) => setFollowUpForm((prev) => ({ ...prev, nextFollowUpTime: e.target.value ? `${e.target.value}:00` : undefined }))}
        placeholder="下次跟进时间"
      />
    </div>
  );
};
