import React, { useState } from 'react';
import { DeployWindowManagement } from '@/components/deploy/DeployWindowManagement';
import { DeployApprovalManagement } from '@/components/deploy/DeployApprovalManagement';
import { VersionRollbackManagement } from '@/components/deploy/VersionRollbackManagement';
import { DeployStatistics } from '@/components/deploy/DeployStatistics';
import { SegmentedControl, SegmentedControlItem } from '@/components/ui';

type DeployTabKey = 'windows' | 'approvals' | 'rollback' | 'statistics';

const tabOptions: Array<{
  key: DeployTabKey;
  label: string;
}> = [
  { key: 'windows', label: '发布窗口' },
  { key: 'approvals', label: '发布审批' },
  { key: 'rollback', label: '版本回滚' },
  { key: 'statistics', label: '发布统计' },
];

export const DeployManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState<DeployTabKey>('windows');

  const renderActivePanel = () => {
    switch (activeTab) {
      case 'approvals':
        return <DeployApprovalManagement />;
      case 'rollback':
        return <VersionRollbackManagement />;
      case 'statistics':
        return <DeployStatistics />;
      case 'windows':
      default:
        return <DeployWindowManagement />;
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
        <SegmentedControl className="min-h-10 flex-wrap">
          {tabOptions.map((item) => (
            <SegmentedControlItem
              key={item.key}
              size="sm"
              active={activeTab === item.key}
              onClick={() => setActiveTab(item.key)}
            >
              {item.label}
            </SegmentedControlItem>
          ))}
        </SegmentedControl>
      </div>

      <div>{renderActivePanel()}</div>
    </div>
  );
};

export default DeployManagement;
