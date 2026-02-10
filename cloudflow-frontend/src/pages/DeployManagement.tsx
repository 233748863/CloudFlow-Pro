import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Settings, Clock, GitBranch, CheckCircle, BarChart3 } from 'lucide-react';
import { DeployWindowManagement } from '@/components/deploy/DeployWindowManagement';
import { DeployApprovalManagement } from '@/components/deploy/DeployApprovalManagement';
import { VersionRollbackManagement } from '@/components/deploy/VersionRollbackManagement';
import { DeployStatistics } from '@/components/deploy/DeployStatistics';

export const DeployManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState('windows');

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Settings className="w-7 h-7 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-800">发布管理</h1>
            <p className="text-sm text-gray-500 mt-1">流程发布窗口、审批、回滚和统计管理</p>
          </div>
        </div>
      </div>

      {/* Tab 导航 */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
          <TabsTrigger value="windows" className="flex items-center gap-2">
            <Clock className="w-4 h-4" />
            <span className="hidden sm:inline">发布窗口</span>
          </TabsTrigger>
          <TabsTrigger value="approvals" className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4" />
            <span className="hidden sm:inline">发布审批</span>
          </TabsTrigger>
          <TabsTrigger value="rollback" className="flex items-center gap-2">
            <GitBranch className="w-4 h-4" />
            <span className="hidden sm:inline">版本回滚</span>
          </TabsTrigger>
          <TabsTrigger value="statistics" className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            <span className="hidden sm:inline">发布统计</span>
          </TabsTrigger>
        </TabsList>

        {/* 发布窗口管理 */}
        <TabsContent value="windows" className="mt-6">
          <DeployWindowManagement />
        </TabsContent>

        {/* 发布审批管理 */}
        <TabsContent value="approvals" className="mt-6">
          <DeployApprovalManagement />
        </TabsContent>

        {/* 版本回滚管理 */}
        <TabsContent value="rollback" className="mt-6">
          <VersionRollbackManagement />
        </TabsContent>

        {/* 发布统计 */}
        <TabsContent value="statistics" className="mt-6">
          <DeployStatistics />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default DeployManagement;
