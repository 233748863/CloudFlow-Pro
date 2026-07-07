import React from 'react';
import { DatePicker, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea, UserSelector } from '@/components/common';
import { useCrmManagement } from '../store';

export const FollowUpDialogContent: React.FC = () => {
  const { followUpForm, setFollowUpForm, customerOptions, opportunityOptions } = useCrmManagement();
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="md:col-span-2">
        <Select value={followUpForm.customerId ? String(followUpForm.customerId) : ''} onValueChange={(value) => setFollowUpForm((prev) => ({ ...prev, customerId: Number(value) }))}>
          <SelectTrigger><SelectValue placeholder="选择客户" /></SelectTrigger>
          <SelectContent>{customerOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="md:col-span-2">
        <Select value={followUpForm.opportunityId ? String(followUpForm.opportunityId) : 'NONE'} onValueChange={(value) => setFollowUpForm((prev) => ({ ...prev, opportunityId: value === 'NONE' ? undefined : Number(value) }))}>
          <SelectTrigger><SelectValue placeholder="关联商机" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="NONE">不关联商机</SelectItem>
            {opportunityOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <Textarea className="md:col-span-2" value={followUpForm.content || ''} onChange={(e) => setFollowUpForm((prev) => ({ ...prev, content: e.target.value }))} placeholder="跟进内容，例如：客户已确认报价范围，待内部审批。" />
      <UserSelector
        single
        allowClear
        value={followUpForm.ownerId ? String(followUpForm.ownerId) : null}
        onChange={(id, picked) => setFollowUpForm((prev) => ({ ...prev, ownerId: id ? Number(id) : undefined, ownerName: picked?.name || '' }))}
        placeholder="选择跟进人"
      />
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
