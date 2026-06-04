import React from 'react';
import { DatePicker, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from '@/components/common';
import { useCrmManagement } from '../store';
import { stageLabelMap } from '../constants';
import { renderStatus } from '../helpers';

export const OpportunityDialogContent: React.FC = () => {
  const { opportunityForm, setOpportunityForm, customerOptions } = useCrmManagement();
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="md:col-span-2">
        <Select value={opportunityForm.customerId ? String(opportunityForm.customerId) : ''} onValueChange={(value) => setOpportunityForm((prev) => ({ ...prev, customerId: Number(value) }))}>
          <SelectTrigger><SelectValue placeholder="选择客户" /></SelectTrigger>
          <SelectContent>{customerOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <Input value={opportunityForm.opportunityName || ''} onChange={(e) => setOpportunityForm((prev) => ({ ...prev, opportunityName: e.target.value }))} placeholder="商机名称，例如：景曜科技三年续约" />
      {opportunityForm.opportunityId ? (
        <Input value={renderStatus(opportunityForm.stage)} readOnly placeholder="商机阶段通过推进/赢单/审批维护" />
      ) : (
        <Select value={opportunityForm.stage || 'LEAD'} onValueChange={(value) => setOpportunityForm((prev) => ({ ...prev, stage: value }))}>
          <SelectTrigger><SelectValue placeholder="商机阶段" /></SelectTrigger>
          <SelectContent>{Object.entries(stageLabelMap).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
        </Select>
      )}
      <Input type="number" value={String(opportunityForm.expectedAmount || 0)} onChange={(e) => setOpportunityForm((prev) => ({ ...prev, expectedAmount: Number(e.target.value || 0) }))} placeholder="预计金额" />
      <Input type="number" value={String(opportunityForm.winRate || 0)} onChange={(e) => setOpportunityForm((prev) => ({ ...prev, winRate: Number(e.target.value || 0) }))} placeholder="赢单率 0-100" />
      <Input value={opportunityForm.ownerName || ''} readOnly placeholder="负责人通过归属与 HR 快照维护" />
      <DatePicker className="h-11" type="date" value={opportunityForm.expectedSignDate || ''} onChange={(e) => setOpportunityForm((prev) => ({ ...prev, expectedSignDate: e.target.value }))} placeholder="预计签约日期" />
      <Textarea className="md:col-span-2" value={opportunityForm.remark || ''} onChange={(e) => setOpportunityForm((prev) => ({ ...prev, remark: e.target.value }))} placeholder="商机背景、阶段说明、当前阻塞项" />
    </div>
  );
};
