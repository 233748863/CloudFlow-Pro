import React, { useEffect, useState } from 'react';
import { Input } from '@/components/common';
import { crmApi } from '@/services/api/crm';
import { crmOperations } from '@/services/api/crm/operations';
import { OpsSelect, useAccess, useRemote } from './OperationsKit';

export interface BusinessOption { id: number; name: string; customerId?: number }
const permissions: Record<string, string> = { CUSTOMER: 'crm:customer:list', LEAD: 'crm:lead:list', CONTACT: 'crm:contact:list', OPPORTUNITY: 'crm:opportunity:list', TICKET: 'crm:ticket:list', QUOTE: 'crm:quote:list', CONTRACT: 'crm:activity:list', RECEIVABLE: 'crm:receivable:list' };

export function BusinessPicker({ type, value, selectedLabel, customerId, onChange, label = '关联对象' }: { type: string; value?: number; selectedLabel?: string; customerId?: number; onChange: (value?: number, option?: BusinessOption) => void; label?: string }) {
  const can = useAccess();
  const allowed = can(permissions[type] || 'crm:customer:list');
  const needsCustomer = type === 'CONTRACT' && !customerId;
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  useEffect(() => { const timer = window.setTimeout(() => setQuery(search), 250); return () => window.clearTimeout(timer); }, [search]);
  const source = useRemote<BusinessOption[]>(async () => {
    if (!allowed || type === 'NONE') return [];
    const params = { pageNum: 1, pageSize: 100, customerId };
    switch (type) {
      case 'CUSTOMER': return (await crmApi.listCustomers({ ...params, customerName: query })).rows.map(row => ({ id: row.customerId!, name: row.customerName, customerId: row.customerId }));
      case 'LEAD': return (await crmApi.listLeads({ ...params, leadName: query })).rows.map(row => ({ id: row.leadId!, name: row.leadName, customerId: row.convertedCustomerId }));
      case 'CONTACT': return (await crmApi.listContacts({ ...params, contactName: query })).rows.map(row => ({ id: row.contactId!, name: row.contactName, customerId: row.customerId }));
      case 'OPPORTUNITY': return (await crmApi.listOpportunities({ ...params, opportunityName: query })).rows.map(row => ({ id: row.opportunityId!, name: row.opportunityName, customerId: row.customerId }));
      case 'TICKET': return (await crmApi.listTickets({ ...params, ticketTitle: query })).rows.map(row => ({ id: row.ticketId!, name: row.ticketTitle, customerId: row.customerId }));
      case 'QUOTE': return (await crmApi.listQuotes({ ...params, quoteName: query })).rows.map(row => ({ id: row.quoteId!, name: row.quoteName, customerId: row.customerId }));
      case 'RECEIVABLE': return (await crmApi.listReceivables({ ...params, receivableName: query })).rows.map(row => ({ id: row.receivableId!, name: row.receivableName, customerId: row.customerId }));
      case 'CONTRACT': return customerId ? (await crmOperations.activityContracts(customerId)).rows.filter(row => row.contractName.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(row => ({ id: row.contractId, name: row.contractName, customerId: row.customerId })) : [];
      default: return [];
    }
  }, [type, query, customerId, allowed]);
  const options = Object.fromEntries((source.data || []).map(row => [String(row.id), row.name]));
  if (value && !options[value]) options[value] = selectedLabel || `已关联对象 #${value}`;
  return <div className="space-y-2"><Input aria-label={`搜索${label}`} placeholder={`搜索${label}`} value={search} onChange={event => setSearch(event.target.value)} disabled={!allowed || needsCustomer} />
    <OpsSelect label={label} value={value} empty={!allowed ? '无权读取此类对象' : needsCustomer ? '请先选择所属客户' : source.loading ? '加载中' : '请选择'} options={options} onChange={selected => onChange(selected ? Number(selected) : undefined, source.data?.find(row => row.id === Number(selected)))} />
    {source.error && <span role="alert" className="text-xs text-rose-600">{source.error}</span>}</div>;
}
