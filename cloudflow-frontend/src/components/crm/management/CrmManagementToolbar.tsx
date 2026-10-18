import React, { useEffect, useState } from 'react';
import { Filter, Plus, Search } from 'lucide-react';
import { Button, Input } from '@/components/common';
import { ImportButton } from '@/components/import/ImportButton';
import { useCrmManagement } from './store';
import { tabLabelMap } from './constants';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { MobileFilterDrawer } from '@/components/mobile/MobileFilterDrawer';

export const CrmManagementToolbar: React.FC = () => {
  const { keyword, setKeyword, tab, hasPermission, openDialog, load, ticketQueue, setTicketQueue } = useCrmManagement();
  const mobileTicket = useBreakpoint() === 'mobile' && tab === 'ticket';
  const [filterOpen, setFilterOpen] = useState(false);
  const [draft, setDraft] = useState({ keyword: '', ticketQueue: false });
  useEffect(() => { if (!mobileTicket) setFilterOpen(false); }, [mobileTicket]);
  if (mobileTicket) return <>
    <section className="card admin-users-toolbar admin-crm-toolbar portal-ticket-toolbar">
      <Button className="min-h-11" variant="outline" aria-label="筛选工单" onClick={() => { setDraft({ keyword, ticketQueue }); setFilterOpen(true); }}><Filter size={16} />筛选工单</Button>
    </section>
    <MobileFilterDrawer open={filterOpen} title="筛选工单" onClose={() => setFilterOpen(false)} onApply={() => { setKeyword(draft.keyword.trim()); setTicketQueue(draft.ticketQueue); setFilterOpen(false); }} onReset={() => setDraft({ keyword: '', ticketQueue: false })}>
      <div className="space-y-4"><label className="block"><span className="input-label">搜索工单</span><Input aria-label="搜索工单" value={draft.keyword} onChange={event => setDraft({ ...draft, keyword: event.target.value })} placeholder="工单标题 / 内容关键字" /></label>
        <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={draft.ticketQueue} onChange={event => setDraft({ ...draft, ticketQueue: event.target.checked })} />只看门户待分派工单</label>
      </div>
    </MobileFilterDrawer>
    {hasPermission('crm:ticket:add') && <div className="cf-mobile-primary-space"><footer className="cf-mobile-primary-footer"><Button className="min-h-11 w-full" onClick={() => openDialog({ type: 'ticket' })}><Plus size={16} />新增工单</Button></footer></div>}
  </>;
  return (
    <section className={`card admin-users-toolbar admin-crm-toolbar${tab === 'ticket' ? ' portal-ticket-toolbar' : ''}`}>
      <div className="admin-crm-toolbar-grid">
        <label className="min-w-0">
          <span className="input-label">搜索客户经营记录</span>
          <div className="admin-source-search-field">
            <Search size={16} />
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="客户 / 商机 / 报价关键字"
              className="admin-crm-toolbar-search-input"
            />
          </div>
        </label>

        <div className="admin-users-toolbar-actions admin-crm-toolbar-actions">
          {tab === 'ticket' && <label className="portal-ticket-queue text-sm"><input type="checkbox" checked={ticketQueue} onChange={event => setTicketQueue(event.target.checked)} /><span>只看门户待分派工单</span></label>}
          <span className="admin-users-filter-count">当前视图 · {tabLabelMap[tab]}</span>
          {tab === 'customer' ? <ImportButton bizType="CUSTOMER" permission="crm:customer:import" onSuccess={() => void load()} /> : null}
          {tab === 'opportunity' ? <ImportButton bizType="OPPORTUNITY" permission="crm:opportunity:import" onSuccess={() => void load()} /> : null}
          {tab === 'customer' && hasPermission('crm:customer:add') ? <Button size="sm" onClick={() => openDialog({ type: 'customer' })}><Plus size={14} className="mr-1.5" />新增客户</Button> : null}
          {tab === 'opportunity' && hasPermission('crm:opportunity:add') ? <Button size="sm" onClick={() => openDialog({ type: 'opportunity' })}><Plus size={14} className="mr-1.5" />新增商机</Button> : null}
          {tab === 'quote' && hasPermission('crm:quote:add') ? <Button size="sm" onClick={() => openDialog({ type: 'quote' })}><Plus size={14} className="mr-1.5" />新增报价</Button> : null}
          {tab === 'receivable' && hasPermission('crm:receivable:add') ? <Button size="sm" onClick={() => openDialog({ type: 'receivable' })}><Plus size={14} className="mr-1.5" />新增回款</Button> : null}
          {tab === 'renewal' && hasPermission('crm:renewal:add') ? <Button size="sm" onClick={() => openDialog({ type: 'renewal' })}><Plus size={14} className="mr-1.5" />新增续约</Button> : null}
          {tab === 'ticket' && hasPermission('crm:ticket:add') ? <Button size="sm" onClick={() => openDialog({ type: 'ticket' })}><Plus size={14} className="mr-1.5" />新增工单</Button> : null}
        </div>
      </div>
    </section>
  );
};
