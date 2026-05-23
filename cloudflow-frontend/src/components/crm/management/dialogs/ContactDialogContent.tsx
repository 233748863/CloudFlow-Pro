import React from 'react';
import { Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/common';
import { useCrmManagement } from '../store';

export const ContactDialogContent: React.FC = () => {
  const { contactForm, setContactForm, customerOptions } = useCrmManagement();
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="md:col-span-2">
        <Select value={contactForm.customerId ? String(contactForm.customerId) : ''} onValueChange={(value) => setContactForm((prev) => ({ ...prev, customerId: Number(value) }))}>
          <SelectTrigger><SelectValue placeholder="选择客户" /></SelectTrigger>
          <SelectContent>{customerOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <Input value={contactForm.contactName || ''} onChange={(e) => setContactForm((prev) => ({ ...prev, contactName: e.target.value }))} placeholder="联系人姓名" />
      <Input value={contactForm.position || ''} onChange={(e) => setContactForm((prev) => ({ ...prev, position: e.target.value }))} placeholder="职位，例如：采购经理" />
      <Input value={contactForm.mobile || ''} onChange={(e) => setContactForm((prev) => ({ ...prev, mobile: e.target.value }))} placeholder="手机号" />
      <Input value={contactForm.email || ''} onChange={(e) => setContactForm((prev) => ({ ...prev, email: e.target.value }))} placeholder="邮箱" />
    </div>
  );
};
