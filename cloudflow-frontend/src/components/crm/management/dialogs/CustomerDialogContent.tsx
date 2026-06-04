import React from 'react';
import { Input, Textarea } from '@/components/common';
import { useCrmManagement } from '../store';

export const CustomerDialogContent: React.FC = () => {
  const { customerForm, setCustomerForm } = useCrmManagement();
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Input value={customerForm.customerName || ''} onChange={(e) => setCustomerForm((prev) => ({ ...prev, customerName: e.target.value }))} placeholder="客户名称，例如：景曜科技" />
      <Input value={customerForm.customerCode || ''} onChange={(e) => setCustomerForm((prev) => ({ ...prev, customerCode: e.target.value }))} placeholder="客户编码，留空自动生成" />
      <Input value={customerForm.ownerName || ''} readOnly placeholder="客户负责人通过领取 / 指派流程维护" />
      <Input value={customerForm.customerTags || ''} onChange={(e) => setCustomerForm((prev) => ({ ...prev, customerTags: e.target.value }))} placeholder="标签示例：重点客户,续约客户" />
      <Input value={customerForm.phone || ''} onChange={(e) => setCustomerForm((prev) => ({ ...prev, phone: e.target.value }))} placeholder="联系电话" />
      <Input value={customerForm.email || ''} onChange={(e) => setCustomerForm((prev) => ({ ...prev, email: e.target.value }))} placeholder="联系邮箱" />
      <Textarea className="md:col-span-2" value={customerForm.remark || ''} onChange={(e) => setCustomerForm((prev) => ({ ...prev, remark: e.target.value }))} placeholder="客户说明、当前合作情况、重点提醒" />
    </div>
  );
};
