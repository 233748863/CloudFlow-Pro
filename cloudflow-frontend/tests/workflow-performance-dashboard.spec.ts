import { expect, test } from '@playwright/test';

const mockUser = {
  code: 200,
  msg: 'success',
  data: {
    user: {
      userId: 1,
      userName: 'admin',
      nickName: 'Admin',
      role: 'ADMIN',
      tenantId: 100000,
      tenantName: '默认租户',
      permissions: ['*:*:*'],
    },
    roles: ['ADMIN'],
    permissions: ['*:*:*'],
  },
};

const mockMenuTree = {
  code: 200,
  msg: 'success',
  data: [
    {
      menuId: 1,
      menuName: '流程中心',
      parentId: 0,
      orderNum: 1,
      path: '/workflow',
      menuType: 'M',
      visible: '0',
      status: '0',
      icon: 'GitMerge',
      children: [
        {
          menuId: 12,
          menuName: '流程监控',
          parentId: 1,
          orderNum: 1,
          path: '/workflow/monitor',
          menuType: 'C',
          visible: '0',
          status: '0',
          icon: 'Activity',
        },
        {
          menuId: 13,
          menuName: '性能统计',
          parentId: 1,
          orderNum: 2,
          path: '/workflow/performance',
          menuType: 'C',
          visible: '0',
          status: '0',
          icon: 'BarChart3',
        },
      ],
    },
  ],
};

const mockTenantList = {
  code: 200,
  msg: 'success',
  data: {
    rows: [
      {
        tenantId: 100000,
        tenantName: '默认租户',
        status: '0',
      },
    ],
  },
};

const mockAnnouncements = {
  code: 200,
  msg: 'success',
  data: [],
};

type DashboardProcess = {
  processDefKey: string;
  processName: string;
  totalCount: number;
  completedCount: number;
  failedCount: number;
  avgDurationMs: number;
  minDurationMs: number;
  maxDurationMs: number;
  successRate: number;
  failedRate: number;
  timeoutInstanceCount: number;
  timeoutEventCount: number;
  timeoutInstanceRate: number;
  anomalyInstanceCount: number;
  anomalyEventCount: number;
  anomalyInstanceRate: number;
  healthLabel: string;
  riskScore: number;
};

const allProcesses: DashboardProcess[] = [
  {
    processDefKey: 'biz_reimburse',
    processName: '财务报销流程',
    totalCount: 12,
    completedCount: 10,
    failedCount: 1,
    avgDurationMs: 64800000,
    minDurationMs: 21600000,
    maxDurationMs: 90000000,
    successRate: 83.3,
    failedRate: 8.3,
    timeoutInstanceCount: 2,
    timeoutEventCount: 3,
    timeoutInstanceRate: 16.7,
    anomalyInstanceCount: 1,
    anomalyEventCount: 1,
    anomalyInstanceRate: 8.3,
    healthLabel: '预警',
    riskScore: 33.3,
  },
  {
    processDefKey: 'vehicle_approval',
    processName: '用车审批流程',
    totalCount: 8,
    completedCount: 8,
    failedCount: 0,
    avgDurationMs: 7200000,
    minDurationMs: 3600000,
    maxDurationMs: 14400000,
    successRate: 100,
    failedRate: 0,
    timeoutInstanceCount: 0,
    timeoutEventCount: 0,
    timeoutInstanceRate: 0,
    anomalyInstanceCount: 0,
    anomalyEventCount: 0,
    anomalyInstanceRate: 0,
    healthLabel: '稳定',
    riskScore: 0,
  },
];

const trendRows = [
  {
    statDate: '2026-05-10',
    totalCount: 8,
    completedCount: 7,
    failedCount: 1,
    avgDurationMs: 32400000,
    minDurationMs: 7200000,
    maxDurationMs: 68400000,
    successRate: 87.5,
    failedRate: 12.5,
    timeoutInstanceCount: 1,
    timeoutEventCount: 1,
    timeoutInstanceRate: 12.5,
    anomalyInstanceCount: 1,
    anomalyEventCount: 1,
    anomalyInstanceRate: 12.5,
    healthLabel: '预警',
  },
  {
    statDate: '2026-05-11',
    totalCount: 12,
    completedCount: 11,
    failedCount: 0,
    avgDurationMs: 18000000,
    minDurationMs: 3600000,
    maxDurationMs: 36000000,
    successRate: 91.7,
    failedRate: 0,
    timeoutInstanceCount: 1,
    timeoutEventCount: 2,
    timeoutInstanceRate: 8.3,
    anomalyInstanceCount: 0,
    anomalyEventCount: 0,
    anomalyInstanceRate: 0,
    healthLabel: '可控',
  },
];

const createDashboardPayload = (processDefKey?: string) => {
  const processes = processDefKey
    ? allProcesses.filter((item) => item.processDefKey === processDefKey)
    : allProcesses;
  const summary = processDefKey ? processes[0] : {
    totalCount: 20,
    completedCount: 18,
    failedCount: 1,
    avgDurationMs: 41890909,
    minDurationMs: 3600000,
    maxDurationMs: 90000000,
    successRate: 90,
    failedRate: 5,
    timeoutInstanceCount: 2,
    timeoutEventCount: 3,
    timeoutInstanceRate: 10,
    anomalyInstanceCount: 1,
    anomalyEventCount: 1,
    anomalyInstanceRate: 5,
    healthLabel: '可控',
  };

  return {
    context: {
      startDate: '2026-05-10',
      endDate: '2026-05-12',
      compareStartDate: '2026-05-07',
      compareEndDate: '2026-05-09',
      processDefKey: processDefKey || '',
      processLabel: processDefKey
        ? processes[0]?.processName || processDefKey
        : '全部流程',
      daySpan: 3,
    },
    summary,
    compareSummary: {
      totalCount: 16,
      completedCount: 14,
      failedCount: 1,
      avgDurationMs: 46800000,
      minDurationMs: 7200000,
      maxDurationMs: 86400000,
      successRate: 87.5,
      failedRate: 6.3,
      timeoutInstanceCount: 2,
      timeoutEventCount: 2,
      timeoutInstanceRate: 12.5,
      anomalyInstanceCount: 1,
      anomalyEventCount: 1,
      anomalyInstanceRate: 6.3,
      healthLabel: '预警',
    },
    trend: processDefKey ? trendRows.map((item) => ({ ...item, totalCount: processDefKey === 'biz_reimburse' ? 6 : 4 })) : trendRows,
    processes,
  };
};

const emptyDashboardPayload = {
  context: {
    startDate: '2026-05-10',
    endDate: '2026-05-12',
    compareStartDate: '2026-05-07',
    compareEndDate: '2026-05-09',
    processDefKey: '',
    processLabel: '全部流程',
    daySpan: 3,
  },
  summary: {
    totalCount: 0,
    completedCount: 0,
    failedCount: 0,
    avgDurationMs: 0,
    minDurationMs: 0,
    maxDurationMs: 0,
    successRate: 0,
    failedRate: 0,
    timeoutInstanceCount: 0,
    timeoutEventCount: 0,
    timeoutInstanceRate: 0,
    anomalyInstanceCount: 0,
    anomalyEventCount: 0,
    anomalyInstanceRate: 0,
    healthLabel: '观察中',
  },
  compareSummary: {
    totalCount: 0,
    completedCount: 0,
    failedCount: 0,
    avgDurationMs: 0,
    minDurationMs: 0,
    maxDurationMs: 0,
    successRate: 0,
    failedRate: 0,
    timeoutInstanceCount: 0,
    timeoutEventCount: 0,
    timeoutInstanceRate: 0,
    anomalyInstanceCount: 0,
    anomalyEventCount: 0,
    anomalyInstanceRate: 0,
    healthLabel: '观察中',
  },
  trend: [],
  processes: [],
};

async function mockWorkflowPerformancePage(page: import('@playwright/test').Page, empty = false) {
  await page.addInitScript(() => {
    localStorage.setItem('cloudflow_pro_user', JSON.stringify({
      id: '1',
      username: 'admin',
      name: 'Admin',
      role: 'ADMIN',
      tenantId: 100000,
      tenantName: '默认租户',
      permissions: ['*:*:*'],
    }));
  });

  await page.route('**/auth/info', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockUser) });
  });
  await page.route('**/auth/getRouters', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockMenuTree) });
  });
  await page.route('**/auth/system/tenant/list**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockTenantList) });
  });
  await page.route('**/oa/announcement/my-list', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockAnnouncements) });
  });
  await page.route('**/oa/announcement/read/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 200, msg: 'success', data: true }) });
  });
  await page.route('**/api/auth/login', async (route) => {
    await route.fulfill({ status: 204, body: '' });
  });
  await page.route('**/workflow/monitor/performance/dashboard**', async (route) => {
    if (empty) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 200, msg: 'success', data: emptyDashboardPayload }),
      });
      return;
    }
    const url = new URL(route.request().url());
    const processDefKey = url.searchParams.get('processDefKey') || undefined;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 200, msg: 'success', data: createDashboardPayload(processDefKey) }),
    });
  });
}

test.describe('workflow performance dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await mockWorkflowPerformancePage(page);
    await page.goto('/workflow/performance');
  });

  test('renders kpis, charts and detail table', async ({ page }) => {
    await expect(page.getByText('历史性能分析看板')).toBeVisible();
    await expect(page.locator('.stat-label').filter({ hasText: '流程总量' }).first()).toBeVisible();
    await expect(page.getByText('执行趋势图')).toBeVisible();
    await expect(page.getByText('风险趋势图')).toBeVisible();
    await expect(page.getByText('流程效率排行')).toBeVisible();
    await expect(page.getByText('风险矩阵')).toBeVisible();
    await expect(page.getByText('流程明细表')).toBeVisible();
    await expect(page.getByTestId('performance-detail-table')).toBeVisible();
    await expect(page.getByTestId('performance-ranking-biz_reimburse')).toBeVisible();
    await expect(page.getByTestId('performance-ranking-vehicle_approval')).toBeVisible();
    await expect(page.getByTestId('performance-detail-table')).toContainText('财务报销流程');
    await expect(page.getByTestId('performance-detail-table')).toContainText('用车审批流程');
  });

  test('clicking ranking row filters the dashboard in-page', async ({ page }) => {
    await page.getByTestId('performance-ranking-biz_reimburse').click();

    await expect(page.getByText('已选流程：财务报销流程')).toBeVisible();
    await expect(page.getByTestId('performance-detail-table')).toContainText('财务报销流程');
    await expect(page.getByTestId('performance-detail-table')).not.toContainText('用车审批流程');
  });

  test('clicking risk matrix bubble filters the dashboard in-page', async ({ page }) => {
    await page.locator('[data-testid="performance-matrix-vehicle_approval"]').click();

    await expect(page.getByText('已选流程：用车审批流程')).toBeVisible();
    await expect(page.getByTestId('performance-detail-table')).toContainText('用车审批流程');
    await expect(page.getByTestId('performance-detail-table')).not.toContainText('财务报销流程');
  });

  test('keeps page overflow contained on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(page.getByText('历史性能分析看板')).toBeVisible();

    const pageOverflowX = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(pageOverflowX).toBeFalsy();
  });
});

test('shows empty states when dashboard has no data', async ({ page }) => {
  await mockWorkflowPerformancePage(page, true);
  await page.goto('/workflow/performance');

  await expect(page.getByText('暂无执行趋势')).toBeVisible();
  await expect(page.getByText('暂无风险趋势')).toBeVisible();
  await expect(page.getByText('暂无流程排行')).toBeVisible();
  await expect(page.getByText('暂无风险矩阵')).toBeVisible();
  await expect(page.getByText('暂无流程明细')).toBeVisible();
});
