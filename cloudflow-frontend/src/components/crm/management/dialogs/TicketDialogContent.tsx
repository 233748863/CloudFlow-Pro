import React from 'react';
import { Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea, UserSelector } from '@/components/common';
import { useCrmManagement } from '../store';

export const TicketDialogContent: React.FC = () => {
  const { ticketForm, setTicketForm, customerOptions } = useCrmManagement();
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="md:col-span-2">
        <Select value={ticketForm.customerId ? String(ticketForm.customerId) : ''} onValueChange={(value) => setTicketForm((prev) => ({ ...prev, customerId: Number(value) }))}>
          <SelectTrigger><SelectValue placeholder="选择客户" /></SelectTrigger>
          <SelectContent>{customerOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <Input value={ticketForm.ticketTitle || ''} onChange={(e) => setTicketForm((prev) => ({ ...prev, ticketTitle: e.target.value }))} placeholder="工单标题" />
      <div className="admin-dialog-field">
        <UserSelector
          value={ticketForm.ownerId ? [String(ticketForm.ownerId)] : []}
          onChange={(userIds) => setTicketForm((prev) => ({
            ...prev,
            ownerId: userIds[0] ? Number(userIds[0]) : undefined,
            ownerName: userIds[0] ? prev.ownerName : '',
          }))}
          onUsersChange={(users) => {
            const user = users[0];
            if (!user) return;
            setTicketForm((prev) => ({
              ...prev,
              ownerId: Number(user.id),
              ownerName: user.name,
            }));
          }}
          multiple={false}
          placeholder="搜索姓名、邮箱或部门选择负责人"
        />
      </div>
      <Textarea className="md:col-span-2" value={ticketForm.description || ''} onChange={(e) => setTicketForm((prev) => ({ ...prev, description: e.target.value }))} placeholder="问题描述、影响范围、当前处理方案" />
    </div>
  );
};
