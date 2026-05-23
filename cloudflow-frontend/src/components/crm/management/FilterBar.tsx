import React from 'react';
import { Plus } from 'lucide-react';
import { Button, Input } from '@/components/common';
import { useCrmManagement } from './store';
import { tabLabelMap } from './constants';

export const FilterBar: React.FC = () => {
  const { keyword, setKeyword, tab, hasPermission, openDialog } = useCrmManagement();
  return (
    <div className="space-y-3">
      <div className="cf-filter-bar">
        <div className="flex flex-wrap items-center gap-3">
          <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="客户 / 商机 / 报价关键字" className="w-full sm:w-[280px]" />
          <div className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            当前视图 · {tabLabelMap[tab]}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {tab === 'customer' && hasPermission('crm:customer:add') ? <Button size="sm" onClick={() => openDialog({ type: 'customer' })}><Plus size={14} className="mr-1.5" />新增客户</Button> : null}
          {tab === 'opportunity' && hasPermission('crm:opportunity:add') ? <Button size="sm" onClick={() => openDialog({ type: 'opportunity' })}><Plus size={14} className="mr-1.5" />新增商机</Button> : null}
          {tab === 'quote' && hasPermission('crm:quote:add') ? <Button size="sm" onClick={() => openDialog({ type: 'quote' })}><Plus size={14} className="mr-1.5" />新增报价</Button> : null}
          {tab === 'receivable' && hasPermission('crm:receivable:add') ? <Button size="sm" onClick={() => openDialog({ type: 'receivable' })}><Plus size={14} className="mr-1.5" />新增回款</Button> : null}
          {tab === 'renewal' && hasPermission('crm:renewal:add') ? <Button size="sm" onClick={() => openDialog({ type: 'renewal' })}><Plus size={14} className="mr-1.5" />新增续约</Button> : null}
          {tab === 'ticket' && hasPermission('crm:ticket:add') ? <Button size="sm" onClick={() => openDialog({ type: 'ticket' })}><Plus size={14} className="mr-1.5" />新增工单</Button> : null}
        </div>
      </div>
    </div>
  );
};
