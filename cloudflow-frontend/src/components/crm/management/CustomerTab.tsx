import React from 'react';
import { Eye, Handshake, RefreshCcw, UserRound } from 'lucide-react';
import { TableHead, TableHeader, TableActionHead, TableRowActions } from '@/components/common';
import { useCrmManagement } from './store';
import { emptyContact, emptyFollowUp } from './constants';
import { renderHealthBadge, renderStatus } from './helpers';

export const CustomerTab: React.FC = () => {
  const { customers, contacts, followUps, openDialog, openCustomerWorkspace } = useCrmManagement();
  return (
    <table className="w-full min-w-[900px]">
      <TableHeader>
        <tr>
          <TableHead>客户</TableHead>
          <TableHead>健康度</TableHead>
          <TableHead>联系人 / 跟进</TableHead>
          <TableHead>负责人</TableHead>
          <TableHead>状态</TableHead>
          <TableActionHead>操作</TableActionHead>
        </tr>
      </TableHeader>
      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
        {customers.map((item) => {
          const contactCount = contacts.filter((contact) => contact.customerId === item.customerId).length;
          const followCount = followUps.filter((follow) => follow.customerId === item.customerId).length;
          return (
            <tr key={item.customerId}>
              <td className="px-4 py-3 text-sm">
                <div>{item.customerName}</div>
                <div className="text-xs text-slate-500">{item.customerCode || '-'} / {item.customerTags || '-'}</div>
              </td>
              <td className="px-4 py-3 text-sm">
                <div>{renderHealthBadge(item.healthLevel)}</div>
                <div className="mt-1 text-xs text-slate-500">{item.healthReason || '-'}</div>
              </td>
              <td className="px-4 py-3 text-sm">{contactCount} / {followCount}</td>
              <td className="px-4 py-3 text-sm">{item.ownerName || '-'}</td>
              <td className="px-4 py-3 text-sm">{renderStatus(item.status)}</td>
              <td className="px-4 py-3 text-right">
                <TableRowActions
                  align="end"
                  overflowLabel="更多"
                  actions={[
                    { label: '客户360', icon: <Eye size={14} />, onClick: () => openCustomerWorkspace(item.customerId), semantic: 'view', isPrimary: true },
                    { label: '编辑客户', icon: <Handshake size={14} />, onClick: () => openDialog({ type: 'customer', item }), semantic: 'edit', isPrimary: true, permissionKey: 'crm:customer:edit' },
                    { label: '新增联系人', icon: <UserRound size={14} />, onClick: () => openDialog({ type: 'contact', item: { ...emptyContact, customerId: item.customerId! } }), semantic: 'custom', permissionKey: 'crm:contact:add' },
                    { label: '新增跟进', icon: <RefreshCcw size={14} />, onClick: () => openDialog({ type: 'followUp', item: { ...emptyFollowUp, customerId: item.customerId! } }), semantic: 'custom', permissionKey: 'crm:follow-up:add' },
                  ]}
                />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};
