# 前端 Phase 1 & Phase 2 补充方案

**创建时间**: 2026-02-22  
**作者**: CloudFlow Team  
**状态**: 📋 待实施

---

## 一、执行摘要

### 1.1 后端变动概览

**Phase 1 新增功能**:
1. ✅ 加签/减签功能（已有前端API）
2. ✅ 自动审批机制（后端自动处理，前端无需改动）
3. ✅ 流程终止功能（已有前端API）
4. ✅ 权限忽略机制（后端处理，前端无需改动）

**Phase 2 新增功能**:
1. ✅ 批量查询优化（后端优化，前端无感知）
2. ✅ Redis缓存机制（后端优化，前端无感知）
3. ✅ 异步处理优化（后端优化，前端无感知）
4. ❌ 监控告警功能（**需要前端补充**）

### 1.2 前端补充需求

**好消息**: 🎉 **Phase 1功能前端已完整支持，无需补充！**

**需要补充**: 🔴 **Phase 2监控告警功能需要前端UI**

---

## 二、Phase 1 前端支持情况

### 2.1 加签/减签功能 ✅

**后端API**:
- `POST /workflow/task/add-signature` - 加签
- `POST /workflow/task/reduction-signature` - 减签

**前端支持**:
```typescript
// cloudflow-frontend/src/services/api/workflow.ts

/**
 * 加签（动态增加审批人）
 */
export async function addSignature(
  taskId: string, 
  userIds: number[], 
  comment: string
): Promise<void> {
  return request.post('/workflow/task/add-signature', {
    taskId,
    userIds,
    comment
  });
}

/**
 * 减签（动态减少审批人）
 */
export async function reductionSignature(
  taskId: string, 
  userIds: number[], 
  comment: string
): Promise<void> {
  return request.post('/workflow/task/reduction-signature', {
    taskId,
    userIds,
    comment
  });
}
```

**UI组件**: 已存在（推测在任务详情页面）

**结论**: ✅ **无需补充**

---

### 2.2 自动审批机制 ✅

**后端实现**: 
- 在 `completeTask()` 后自动检查并执行
- 完全透明，前端无需感知

**前端影响**: 无

**结论**: ✅ **无需补充**

---

### 2.3 流程终止功能 ✅

**后端API**:
- `POST /workflow/instance/terminate`

**前端支持**:
```typescript
// cloudflow-frontend/src/services/api/workflow.ts

/**
 * 终止流程请求参数
 */
export interface TerminateProcessRequest {
  instanceId: string;
  reason: string;
}

/**
 * P1-3: 终止流程（管理员强制终止异常流程）
 */
export async function terminateProcess(
  data: TerminateProcessRequest
): Promise<{ 
  instanceId: string; 
  deletedTasks: number; 
  reason: string; 
  message: string 
}> {
  return request.post('/workflow/instance/terminate', data);
}
```

**UI组件**: 已存在（推测在流程详情页面）

**结论**: ✅ **无需补充**

---

### 2.4 权限忽略机制 ✅

**后端实现**:
- 通过变量 `_ignore_permission` 传递
- 管理员专用功能

**前端影响**: 
- 可选：在管理员操作时传递特殊标志
- 当前无此功能也不影响使用

**结论**: ✅ **无需补充**（可选增强）

---

## 三、Phase 2 前端补充需求

### 3.1 性能优化（批量查询/缓存/异步） ✅

**后端实现**:
- 批量查询优化
- Redis缓存机制
- 异步处理优化

**前端影响**: 
- 完全透明，前端无需改动
- 用户体验自动提升（响应更快）

**结论**: ✅ **无需补充**

---

### 3.2 监控告警功能 ❌

**后端实现**:
- 6张监控表
- 流程/节点/任务监控
- 超时/异常告警
- 性能统计

**前端缺失**: 
- ❌ 监控大屏UI
- ❌ 告警列表UI
- ❌ 性能统计图表
- ❌ 监控API调用

**结论**: 🔴 **需要补充**

---

## 四、监控告警前端补充方案

### 4.1 需要新增的API服务

创建文件: `cloudflow-frontend/src/services/api/monitor.ts`

```typescript
/**
 * 工作流监控告警 API 服务层
 * Phase 2 新增功能
 */

import request from './request';

// ==================== 类型定义 ====================

/**
 * 流程监控记录
 */
export interface ProcessMonitor {
  id: number;
  instanceId: string;
  processDefKey: string;
  processName: string;
  status: string;
  startTime: string;
  endTime?: string;
  durationMs?: number;
  nodeCount: number;
  taskCount: number;
  errorMessage?: string;
}

/**
 * 超时告警记录
 */
export interface TimeoutAlert {
  id: number;
  alertType: 'TASK' | 'PROCESS';
  relatedId: string;
  relatedTitle: string;
  alertLevel: 'WARNING' | 'CRITICAL';
  timeoutHours: number;
  assigneeId?: number;
  assigneeName?: string;
  notificationSent: boolean;
  escalated: boolean;
  createTime: string;
}

/**
 * 异常告警记录
 */
export interface AnomalyAlert {
  id: number;
  instanceId: string;
  processDefKey: string;
  processName: string;
  anomalyType: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  errorDetails?: string;
  resolved: boolean;
  resolveNote?: string;
  createTime: string;
}

/**
 * 性能统计数据
 */
export interface PerformanceStats {
  id: number;
  statDate: string;
  processDefKey: string;
  processName: string;
  totalCount: number;
  completedCount: number;
  avgDurationMs: number;
  maxDurationMs: number;
  minDurationMs: number;
  successRate: number;
  timeoutRate: number;
  anomalyRate: number;
}

/**
 * 监控概览数据
 */
export interface MonitorOverview {
  // 今日统计
  todayStarted: number;
  todayCompleted: number;
  todayTimeout: number;
  todayAnomaly: number;
  
  // 当前状态
  runningCount: number;
  pendingTaskCount: number;
  
  // 告警统计
  warningAlertCount: number;
  criticalAlertCount: number;
  unresolvedAnomalyCount: number;
  
  // 性能指标
  avgCompletionTimeMs: number;
  successRate: number;
}

// ==================== 流程监控 API ====================

/**
 * 获取流程监控列表
 */
export async function getProcessMonitors(params?: {
  pageNum?: number;
  pageSize?: number;
  processDefKey?: string;
  status?: string;
  startTimeFrom?: string;
  startTimeTo?: string;
}): Promise<any> {
  return request.get('/workflow/monitor/process/list', { params });
}

/**
 * 获取流程监控详情
 */
export async function getProcessMonitor(instanceId: string): Promise<ProcessMonitor> {
  return request.get(`/workflow/monitor/process/${instanceId}`);
}

// ==================== 超时告警 API ====================

/**
 * 获取超时告警列表
 */
export async function getTimeoutAlerts(params?: {
  pageNum?: number;
  pageSize?: number;
  alertType?: 'TASK' | 'PROCESS';
  alertLevel?: 'WARNING' | 'CRITICAL';
  resolved?: boolean;
}): Promise<any> {
  return request.get('/workflow/monitor/timeout/list', { params });
}

/**
 * 处理超时告警
 */
export async function handleTimeoutAlert(alertId: number, action: string): Promise<void> {
  return request.post(`/workflow/monitor/timeout/${alertId}/handle`, { action });
}

// ==================== 异常告警 API ====================

/**
 * 获取异常告警列表
 */
export async function getAnomalyAlerts(params?: {
  pageNum?: number;
  pageSize?: number;
  anomalyType?: string;
  severity?: string;
  resolved?: boolean;
}): Promise<any> {
  return request.get('/workflow/monitor/anomaly/list', { params });
}

/**
 * 解决异常告警
 */
export async function resolveAnomalyAlert(
  alertId: number, 
  resolveNote: string
): Promise<void> {
  return request.post(`/workflow/monitor/anomaly/${alertId}/resolve`, { resolveNote });
}

// ==================== 性能统计 API ====================

/**
 * 获取性能统计数据
 */
export async function getPerformanceStats(params?: {
  startDate?: string;
  endDate?: string;
  processDefKey?: string;
}): Promise<PerformanceStats[]> {
  return request.get('/workflow/monitor/performance/stats', { params });
}

/**
 * 获取监控概览
 */
export async function getMonitorOverview(): Promise<MonitorOverview> {
  return request.get('/workflow/monitor/overview');
}

/**
 * 获取流程趋势数据（用于图表）
 */
export async function getProcessTrend(params?: {
  days?: number;
  processDefKey?: string;
}): Promise<any> {
  return request.get('/workflow/monitor/trend', { params });
}

// ==================== 导出 ====================

export default {
  // 流程监控
  getProcessMonitors,
  getProcessMonitor,
  
  // 超时告警
  getTimeoutAlerts,
  handleTimeoutAlert,
  
  // 异常告警
  getAnomalyAlerts,
  resolveAnomalyAlert,
  
  // 性能统计
  getPerformanceStats,
  getMonitorOverview,
  getProcessTrend,
};
```

---

### 4.2 需要新增的页面组件

#### 4.2.1 监控大屏页面

**文件**: `cloudflow-frontend/src/pages/WorkflowMonitor.tsx`

**功能**:
- 实时监控概览（今日启动/完成/超时/异常）
- 流程趋势图表（折线图）
- 告警列表（超时/异常）
- 性能指标（平均完成时间、成功率）

**技术栈**:
- React + TypeScript
- ECharts / Recharts（图表库）
- TailwindCSS（样式）
- 自动刷新（每30秒）

**布局**:
```
┌─────────────────────────────────────────────────┐
│  监控大屏                                        │
├─────────────────────────────────────────────────┤
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐              │
│  │今日  │ │今日  │ │超时  │ │异常  │              │
│  │启动  │ │完成  │ │告警  │ │告警  │              │
│  └─────┘ └─────┘ └─────┘ └─────┘              │
├─────────────────────────────────────────────────┤
│  流程趋势图表（折线图）                          │
│  ┌───────────────────────────────────────┐     │
│  │                                       │     │
│  │   启动数 ─────                        │     │
│  │   完成数 ─────                        │     │
│  │   超时数 ─────                        │     │
│  │                                       │     │
│  └───────────────────────────────────────┘     │
├─────────────────────────────────────────────────┤
│  告警列表                                        │
│  ┌───────────────────────────────────────┐     │
│  │ 🔴 严重超时：合同审批流程 - 已超时72小时 │     │
│  │ 🟡 超时提醒：报销申请 - 已超时24小时    │     │
│  │ 🔴 异常流程：请假申请 - 执行失败        │     │
│  └───────────────────────────────────────┘     │
└─────────────────────────────────────────────────┘
```

---

#### 4.2.2 告警列表页面

**文件**: `cloudflow-frontend/src/pages/AlertList.tsx`

**功能**:
- 超时告警列表（可筛选）
- 异常告警列表（可筛选）
- 告警处理（标记已处理、添加备注）
- 告警详情查看

**筛选条件**:
- 告警类型（超时/异常）
- 告警级别（提醒/警告/严重）
- 处理状态（未处理/已处理）
- 时间范围

---

#### 4.2.3 性能统计页面

**文件**: `cloudflow-frontend/src/pages/PerformanceStats.tsx`

**功能**:
- 按流程类型统计
- 按时间段统计
- 性能指标对比（平均时长、成功率）
- 导出统计报表

**图表类型**:
- 柱状图（各流程完成数量）
- 饼图（流程类型分布）
- 折线图（性能趋势）

---

### 4.3 菜单配置

需要在 `sys_menu` 表中添加监控菜单：

```sql
-- 流程监控菜单（一级目录下的二级菜单）
INSERT INTO sys_menu VALUES(
  401, '流程监控', 4, 2, 
  '/workflow/monitor', 
  'pages/WorkflowMonitor', 
  NULL, 0, 0, 'C', '0', '0', 
  'workflow:monitor:list', 
  'Monitor', 
  'admin', sysdate(), '', null, 
  '流程监控大屏'
);

-- 告警管理菜单
INSERT INTO sys_menu VALUES(
  402, '告警管理', 4, 3, 
  '/workflow/alerts', 
  'pages/AlertList', 
  NULL, 0, 0, 'C', '0', '0', 
  'workflow:alert:list', 
  'Bell', 
  'admin', sysdate(), '', null, 
  '告警列表管理'
);

-- 性能统计菜单
INSERT INTO sys_menu VALUES(
  403, '性能统计', 4, 4, 
  '/workflow/performance', 
  'pages/PerformanceStats', 
  NULL, 0, 0, 'C', '0', '0', 
  'workflow:performance:list', 
  'BarChart', 
  'admin', sysdate(), '', null, 
  '流程性能统计'
);
```

---

## 五、实施计划

### 5.1 优先级划分

| 功能 | 优先级 | 工作量 | 说明 |
|------|--------|--------|------|
| 监控API服务 | 🔴 P0 | 2小时 | 必须先实现 |
| 监控大屏页面 | 🔴 P0 | 1天 | 核心功能 |
| 告警列表页面 | 🟡 P1 | 1天 | 重要功能 |
| 性能统计页面 | 🟡 P1 | 1天 | 重要功能 |
| 菜单配置 | 🔴 P0 | 30分钟 | 必须配置 |

### 5.2 实施步骤

#### 第1天（核心功能）
1. ✅ 创建 `monitor.ts` API服务（2小时）
2. ✅ 创建监控大屏页面（6小时）
3. ✅ 配置菜单和路由（30分钟）
4. ✅ 测试基础功能（1.5小时）

#### 第2天（告警管理）
1. ✅ 创建告警列表页面（6小时）
2. ✅ 实现告警处理功能（2小时）
3. ✅ 测试告警功能（2小时）

#### 第3天（性能统计）
1. ✅ 创建性能统计页面（6小时）
2. ✅ 实现图表展示（2小时）
3. ✅ 测试统计功能（2小时）

**总工作量**: 3个工作日

---

### 5.3 技术依赖

**需要安装的npm包**:
```bash
# 图表库（二选一）
npm install echarts echarts-for-react
# 或
npm install recharts

# 日期处理
npm install dayjs

# 实时刷新（可选）
npm install swr
```

---

## 六、后端API需求

### 6.1 需要后端补充的API

根据前端需求，后端需要补充以下API：

#### 监控Controller

**文件**: `WorkflowMonitorController.java`

```java
/**
 * 工作流监控API
 */
@RestController
@RequestMapping("/workflow/monitor")
public class WorkflowMonitorController {
    
    /**
     * 获取监控概览
     */
    @GetMapping("/overview")
    public R<MonitorOverview> getOverview() {
        // 实现
    }
    
    /**
     * 获取流程监控列表
     */
    @GetMapping("/process/list")
    public TableDataInfo<ProcessMonitor> getProcessMonitors(PageQuery pageQuery) {
        // 实现
    }
    
    /**
     * 获取超时告警列表
     */
    @GetMapping("/timeout/list")
    public TableDataInfo<TimeoutAlert> getTimeoutAlerts(PageQuery pageQuery) {
        // 实现
    }
    
    /**
     * 获取异常告警列表
     */
    @GetMapping("/anomaly/list")
    public TableDataInfo<AnomalyAlert> getAnomalyAlerts(PageQuery pageQuery) {
        // 实现
    }
    
    /**
     * 获取性能统计
     */
    @GetMapping("/performance/stats")
    public R<List<PerformanceStats>> getPerformanceStats(
        @RequestParam(required = false) String startDate,
        @RequestParam(required = false) String endDate,
        @RequestParam(required = false) String processDefKey
    ) {
        // 实现
    }
    
    /**
     * 获取流程趋势
     */
    @GetMapping("/trend")
    public R<Map<String, Object>> getProcessTrend(
        @RequestParam(defaultValue = "7") Integer days,
        @RequestParam(required = false) String processDefKey
    ) {
        // 实现
    }
    
    /**
     * 处理超时告警
     */
    @PostMapping("/timeout/{alertId}/handle")
    public R<Void> handleTimeoutAlert(
        @PathVariable Long alertId,
        @RequestBody Map<String, String> params
    ) {
        // 实现
    }
    
    /**
     * 解决异常告警
     */
    @PostMapping("/anomaly/{alertId}/resolve")
    public R<Void> resolveAnomalyAlert(
        @PathVariable Long alertId,
        @RequestBody Map<String, String> params
    ) {
        // 实现
    }
}
```

**工作量**: 1-2天（如果监控服务已实现，只需要暴露API）

---

## 七、总结

### 7.1 Phase 1 前端状态

✅ **完全就绪，无需补充**

- 加签/减签功能 - API已存在
- 自动审批机制 - 后端透明处理
- 流程终止功能 - API已存在
- 权限忽略机制 - 后端处理

### 7.2 Phase 2 前端状态

🟡 **核心功能就绪，监控功能需补充**

**已就绪**:
- 批量查询优化 - 前端无感知
- Redis缓存机制 - 前端无感知
- 异步处理优化 - 前端无感知

**需补充**:
- 监控大屏UI - 3天工作量
- 告警管理UI - 包含在3天内
- 性能统计UI - 包含在3天内

### 7.3 实施建议

**立即实施** (P0):
1. 创建监控API服务（2小时）
2. 创建监控大屏页面（1天）
3. 配置菜单和路由（30分钟）

**短期实施** (P1 - 1周内):
1. 创建告警列表页面（1天）
2. 创建性能统计页面（1天）

**可选实施** (P2):
1. 实时推送告警（WebSocket）
2. 告警规则配置UI
3. 自定义监控指标

### 7.4 依赖关系

**前端依赖后端**:
- 需要后端先实现监控Controller API
- 需要后端监控服务正常运行
- 需要后端数据采集正常工作

**建议顺序**:
1. 后端完成监控服务实现（Phase 2剩余工作）
2. 后端暴露监控API（1-2天）
3. 前端实现监控UI（3天）
4. 联调测试（1天）

**总计**: 约1周完成Phase 2前端补充

---

**文档版本**: v1.0  
**创建时间**: 2026-02-22  
**状态**: 📋 待实施  
**预计完成**: 2026-02-29
