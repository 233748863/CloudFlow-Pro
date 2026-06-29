import React from 'react';
import { Plus, Search } from 'lucide-react';
import { Button, Input } from '@/components/common';
import { useCrmManagement } from './store';
import { tabLabelMap } from './constants';

export const CrmManagementToolbar: React.FC = () => {
  const { keyword, setKeyword, tab, hasPermission, openDialog } = useCrmManagement();
  return (
    <section className="card admin-users-toolbar admin-crm-toolbar">
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
          <span className="admin-users-filter-count">当前视图 · {tabLabelMap[tab]}</span>
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
