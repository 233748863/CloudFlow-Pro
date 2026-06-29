import React, { useMemo, useState } from 'react';
import {
  Activity,
  CalendarRange,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import { DeployWindowManagement } from '@/components/deploy/DeployWindowManagement';
import { DeployApprovalManagement } from '@/components/deploy/DeployApprovalManagement';
import { VersionRollbackManagement } from '@/components/deploy/VersionRollbackManagement';
import { DeployStatistics } from '@/components/deploy/DeployStatistics';
import { HotUpdatePanel } from '@/components/deploy/HotUpdatePanel';
import { TablePageLayout } from '@/components/layout/TablePageLayout';

type DeployTabKey = 'windows' | 'approvals' | 'rollback' | 'hotupdate' | 'statistics';

const tabOptions: Array<{
  key: DeployTabKey;
  label: string;
  description: string;
  icon: React.ReactNode;
}> = [
  {
    key: 'windows',
    label: '发布窗口',
    description: '控制发布时段与冻结窗口',
    icon: <CalendarRange size={15} />,
  },
  {
    key: 'approvals',
    label: '发布审批',
    description: '集中处理上线审批链路',
    icon: <ShieldCheck size={15} />,
  },
  {
    key: 'rollback',
    label: '版本回滚',
    description: '异常发布后快速恢复',
    icon: <RotateCcw size={15} />,
  },
  {
    key: 'hotupdate',
    label: '热更新',
    description: '运行中实例迁移到最新版本',
    icon: <RefreshCw size={15} />,
  },
  {
    key: 'statistics',
    label: '发布统计',
    description: '发布行为汇总与复盘',
    icon: <Activity size={15} />,
  },
];

export const DeployManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState<DeployTabKey>('windows');

  const activeTabMeta = useMemo(
    () => tabOptions.find((item) => item.key === activeTab) || tabOptions[0],
    [activeTab],
  );

  const renderActivePanel = () => {
    switch (activeTab) {
      case 'approvals':
        return <DeployApprovalManagement />;
      case 'rollback':
        return <VersionRollbackManagement />;
      case 'hotupdate':
        return <HotUpdatePanel />;
      case 'statistics':
        return <DeployStatistics />;
      case 'windows':
      default:
        return <DeployWindowManagement />;
    }
  };

  const pageActions = (
    <header className="admin-source-header">
      <div>
        <p className="admin-source-kicker">DEPLOYMENT OPS</p>
        <h2>发布管理</h2>
        <span>{activeTabMeta.description}</span>
      </div>
    </header>
  );

  const pageFilters = (
      <section className="card admin-deploy-command-strip">
        <div className="admin-deploy-status-grid">
          {tabOptions.map((item, index) => {
            const active = activeTab === item.key;
            const tone = index === 0 ? 'blue' : index === 1 ? 'green' : index === 2 ? 'amber' : index === 3 ? 'violet' : 'slate';
            return (
              <button
                key={item.key}
                type="button"
                aria-pressed={active}
                className={`admin-deploy-status-cell tone-${tone} ${active ? 'is-active' : ''}`}
                onClick={() => setActiveTab(item.key)}
              >
                <span className="admin-deploy-status-icon">{item.icon}</span>
                <span className="admin-deploy-status-copy">
                  <strong>{item.label}</strong>
                  <em>{active ? '当前模块' : item.description}</em>
                </span>
              </button>
            );
          })}
        </div>
        <div className="admin-deploy-context-rail">
          <span>{activeTabMeta.description}</span>
          <div>
            {tabOptions.map((item) => (
              <button
                key={item.key}
                type="button"
                data-active={activeTab === item.key ? 'true' : 'false'}
                onClick={() => setActiveTab(item.key)}
              >
              {item.icon}
              {item.label}
              </button>
            ))}
          </div>
        </div>
      </section>
  );

  const pageContent = (
      <div className="admin-source-content">
        <div className="grid gap-4">
          {renderActivePanel()}
        </div>
      </div>
  );

  return (
    <section className="admin-source-page">
      <TablePageLayout
        actions={pageActions}
        filters={pageFilters}
        table={pageContent}
      />
    </section>
  );
};

export default DeployManagement;
