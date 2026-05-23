import React from 'react';
import { DatePicker, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/common';
import { useCrmManagement } from '../store';

export const RenewalDialogContent: React.FC = () => {
  const {
    renewalForm,
    setRenewalForm,
    customerOptions,
    contractOptions,
    applyContractToRenewal,
  } = useCrmManagement();
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="md:col-span-2">
        <Select value={renewalForm.customerId ? String(renewalForm.customerId) : ''} onValueChange={(value) => setRenewalForm((prev) => ({ ...prev, customerId: Number(value) }))}>
          <SelectTrigger><SelectValue placeholder="选择客户" /></SelectTrigger>
          <SelectContent>{customerOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="md:col-span-2">
        <Select
          value={renewalForm.contractId ? String(renewalForm.contractId) : 'NONE'}
          onValueChange={(value) => {
            if (value === 'NONE') {
              setRenewalForm((prev) => ({ ...prev, contractId: undefined, contractNo: undefined }));
              return;
            }
            applyContractToRenewal(Number(value));
          }}
        >
          <SelectTrigger><SelectValue placeholder="选择OA合同" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="NONE">不关联合同</SelectItem>
            {contractOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <Input value={renewalForm.renewalName || ''} onChange={(e) => setRenewalForm((prev) => ({ ...prev, renewalName: e.target.value }))} placeholder="续约名称" />
      <Input type="number" value={String(renewalForm.renewalAmount || 0)} onChange={(e) => setRenewalForm((prev) => ({ ...prev, renewalAmount: Number(e.target.value || 0) }))} placeholder="续约金额" />
      <Input value={renewalForm.contractNo || ''} onChange={(e) => setRenewalForm((prev) => ({ ...prev, contractNo: e.target.value }))} placeholder="合同编号" />
      <DatePicker className="h-11" type="date" value={renewalForm.currentExpireDate || ''} onChange={(e) => setRenewalForm((prev) => ({ ...prev, currentExpireDate: e.target.value }))} placeholder="当前到期日期" />
    </div>
  );
};
