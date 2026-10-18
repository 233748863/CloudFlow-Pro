import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { UserDashboardCharts } from '../../cloudflow-frontend/src/components/user/dashboard/UserDashboardCharts';
import '../../cloudflow-frontend/src/index.css';

const trend = Array.from({ length: 7 }, (_, index) => ({ label: `2026-09-${index + 20}`, shortLabel: `09-${index + 20}`, tasks: 10 + index, applications: 4 + index % 3, announcements: 2, schedules: 3 + index % 2 }));
createRoot(document.getElementById('root')!).render(<BrowserRouter><main className="p-4">
  <UserDashboardCharts startDate="2026-09-20" endDate="2026-09-26" granularity="day" loading={false}
    distribution={[
      { label: '待办审批', count: 35, description: '等待处理', slot: 1 },
      { label: '我的申请', count: 25, description: '已提交申请', slot: 2 },
      { label: '公告提醒', count: 15, description: '新公告', slot: 3 },
      { label: '日程安排', count: 25, description: '日程事项', slot: 4 },
    ]} trend={trend} onStartDateChange={() => {}} onEndDateChange={() => {}} onGranularityChange={() => {}} onRefresh={() => {}} />
</main></BrowserRouter>);
