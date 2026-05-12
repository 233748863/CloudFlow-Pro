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

const mockDeptTree = {
  code: 200,
  msg: 'success',
  data: [
    {
      deptId: 101,
      deptName: '研发部',
      children: [],
    },
  ],
};

const mockMenuTree = {
  code: 200,
  msg: 'success',
  data: [
    {
      menuId: 1,
      menuName: '人力资源',
      parentId: 0,
      orderNum: 1,
      path: '/hr',
      menuType: 'M',
      visible: '0',
      status: '0',
      icon: 'Users',
      children: [
        {
          menuId: 11,
          menuName: '绩效管理',
          parentId: 1,
          orderNum: 1,
          path: '/hr/performance',
          menuType: 'C',
          visible: '0',
          status: '0',
          icon: 'Target',
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

const mockEmployees = {
  code: 200,
  msg: 'success',
  data: [
    {
      id: 1003,
      employeeNo: 'CF20240008',
      name: '后端测试',
      deptId: 101,
      deptName: '研发部',
      postName: '普通员工',
    },
  ],
};

const objectiveListRows = [
  {
    id: 9001,
    objectiveNo: 'HRPF2026Q2001',
    cycleName: '2026 Q2',
    cycleStartDate: '2026-04-01',
    cycleEndDate: '2026-06-30',
    objectiveName: '研发交付质量提升',
    totalTargetAmount: 100,
    actualAmount: 80,
    completionRate: 80,
    score: 88,
    grade: 'B+',
    scoreCap: 120,
    status: 'PLAN_APPROVED',
    categoryCodes: ['QUALITY', 'DELIVERY'],
    categoryDefinitions: [
      { categoryCode: 'QUALITY', categoryName: '质量改进' },
      { categoryCode: 'DELIVERY', categoryName: '交付效率' },
    ],
    metrics: [
      { metricCode: 'DEFECT_CLOSE_RATE', metricName: '缺陷关闭率', metricUnit: '%', metricWeight: 50, precision: 2, valueType: 'PERCENT' },
      { metricCode: 'ON_TIME_RATE', metricName: '交付准时率', metricUnit: '%', metricWeight: 50, precision: 2, valueType: 'PERCENT' },
    ],
    leafTaskCount: 2,
    departmentCount: 1,
    assignments: [],
  },
];

const treeAssignments = [
  {
    id: 9101,
    objectiveId: 9001,
    assigneeType: 'DEPT',
    assigneeId: 101,
    assigneeName: '研发部',
    targetAmount: 100,
    actualAmount: 80,
    completionRate: 80,
    metricWeight: 100,
    quotaSource: 'MANAGER',
    locked: false,
    children: [
      {
        id: 9102,
        objectiveId: 9001,
        parentId: 9101,
        assigneeType: 'DEPT',
        assigneeId: 101,
        assigneeName: '研发部',
        categoryCode: 'QUALITY',
        categoryName: '质量改进',
        metricCode: 'DEFECT_CLOSE_RATE',
        metricName: '缺陷关闭率',
        metricUnit: '%',
        metricWeight: 50,
        targetAmount: 50,
        actualAmount: 40,
        completionRate: 80,
        locked: true,
        quotaSource: 'MANAGER',
        children: [
          {
            id: 9104,
            objectiveId: 9001,
            parentId: 9102,
            assigneeType: 'EMPLOYEE',
            assigneeId: 1003,
            assigneeName: '后端测试',
            targetAmount: 50,
            actualAmount: 40,
            completionRate: 80,
            quotaSource: 'MANAGER',
            locked: false,
          },
        ],
      },
      {
        id: 9103,
        objectiveId: 9001,
        parentId: 9101,
        assigneeType: 'DEPT',
        assigneeId: 101,
        assigneeName: '研发部',
        categoryCode: 'DELIVERY',
        categoryName: '交付效率',
        metricCode: 'ON_TIME_RATE',
        metricName: '交付准时率',
        metricUnit: '%',
        metricWeight: 50,
        targetAmount: 50,
        actualAmount: 40,
        completionRate: 80,
        locked: true,
        quotaSource: 'MANAGER',
        children: [
          {
            id: 9105,
            objectiveId: 9001,
            parentId: 9103,
            assigneeType: 'EMPLOYEE',
            assigneeId: 1003,
            assigneeName: '后端测试',
            targetAmount: 50,
            actualAmount: 40,
            completionRate: 80,
            quotaSource: 'MANAGER',
            locked: false,
          },
        ],
      },
    ],
  },
];

const treePayload = {
  id: 9001,
  cycleStartDate: '2026-04-01',
  cycleEndDate: '2026-06-30',
  actualAmount: 80,
  completionRate: 80,
  score: 88,
  grade: 'B+',
  status: 'PLAN_APPROVED',
  assignments: treeAssignments,
  salaryAdjustments: [],
};

const overviewPayload = {
  code: 200,
  msg: 'success',
  data: {
    draftCount: 0,
    planApprovingCount: 0,
    runningCount: 1,
    resultApprovingCount: 0,
    completedCount: 0,
    objectiveCount: 1,
    activeObjectiveCount: 1,
    completedObjectiveCount: 0,
  },
};

const listPayload = {
  code: 200,
  msg: 'success',
  data: {
    rows: objectiveListRows,
    records: objectiveListRows,
    total: 1,
    current: 1,
    size: 50,
  },
};

const treeResponse = {
  code: 200,
  msg: 'success',
  data: treePayload,
};

async function mockPerformancePage(page: import('@playwright/test').Page) {
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
  await page.route('**/auth/system/dept/tree', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockDeptTree) });
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
  await page.route('**/hr/employees', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 200, msg: 'success', data: mockEmployees.data }) });
  });
  await page.route('**/hr/performance/overview', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(overviewPayload) });
  });
  await page.route('**/hr/performance/objective/list**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(listPayload) });
  });
  await page.route('**/hr/performance/objective/9001/tree', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(treeResponse) });
  });
}

async function expectColumnAlignment(page: import('@playwright/test').Page, shellIndex: number, columns: number) {
  const shell = page.locator('.performance-table-shell').nth(shellIndex);
  await expect(shell).toBeVisible();
  const heads = shell.locator('thead th');
  const cells = shell.locator('tbody tr').first().locator('td');
  for (let index = 0; index < columns; index += 1) {
    const headBox = await heads.nth(index).boundingBox();
    const cellBox = await cells.nth(index).boundingBox();
    expect(headBox).not.toBeNull();
    expect(cellBox).not.toBeNull();
    const xDiff = Math.abs((headBox?.x ?? 0) - (cellBox?.x ?? 0));
    const widthDiff = Math.abs((headBox?.width ?? 0) - (cellBox?.width ?? 0));
    expect(xDiff).toBeLessThanOrEqual(2);
    expect(widthDiff).toBeLessThanOrEqual(2);
  }
}

test.describe('HR performance layout', () => {
  test.beforeEach(async ({ page }) => {
    await mockPerformancePage(page);
    await page.goto('/hr/performance');
    await expect(page.getByText('Performance Objective')).toBeVisible();
    await expect(page.getByRole('button', { name: '目标树' })).toBeVisible();
    await expect(page.getByText('研发交付质量提升').first()).toBeVisible();
    await expect(page.getByText('2026 Q2 / HRPF2026Q2001')).toBeVisible();
  });

  test('tree tab keeps header and cell tracks aligned', async ({ page }) => {
    await expectColumnAlignment(page, 0, 7);
    const operationHeader = page.locator('.performance-table-shell').nth(0).locator('thead th').last();
    const operationCell = page.locator('.performance-table-shell').nth(0).locator('tbody tr').first().locator('td').last();
    const headerBox = await operationHeader.boundingBox();
    const cellBox = await operationCell.boundingBox();
    expect(Math.abs((headerBox?.width ?? 0) - (cellBox?.width ?? 0))).toBeLessThanOrEqual(2);
  });

  test('matrix tab keeps validation and metric tables aligned', async ({ page }) => {
    await page.getByRole('button', { name: '类型矩阵' }).click();
    await expectColumnAlignment(page, 0, 5);
    await expectColumnAlignment(page, 1, 7);
  });

  test('progress tab keeps employee action column stable and scroll contained', async ({ page }) => {
    await page.getByRole('button', { name: '进度填报' }).click();
    await expect(page.getByText('质量改进').first()).toBeVisible();
    await expect(page.getByText('缺陷关闭率').first()).toBeVisible();
    await expectColumnAlignment(page, 0, 6);
    await expectColumnAlignment(page, 1, 7);

    const shells = page.locator('.performance-table-shell');
    const count = await shells.count();
    for (let index = 0; index < count; index += 1) {
      const scroll = shells.nth(index).locator('.performance-table-scroll');
      const shellOverflowsViewport = await shells.nth(index).evaluate((node) => node.scrollWidth > node.clientWidth);
      const scrollMetrics = await scroll.evaluate((node) => ({
        clientWidth: node.clientWidth,
        scrollWidth: node.scrollWidth,
      }));
      expect(shellOverflowsViewport).toBeFalsy();
      expect(scrollMetrics.scrollWidth).toBeGreaterThanOrEqual(scrollMetrics.clientWidth);
    }

    const pageOverflowX = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(pageOverflowX).toBeFalsy();
  });
});
