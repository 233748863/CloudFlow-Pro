# 阶段一：任务管理模块技术设计方案

## 1. 概述
本阶段旨在引入“非流程化”的任务管理能力，支持用户创建、分配、跟踪日常工作任务。核心功能包括“我的待办”列表升级和“任务看板”视图。

## 2. 数据库设计 (Database Design)

### 2.1 新增表：`sys_work_task`
用于存储协作任务数据，区别于 `wf_task`（流程任务）。

```sql
CREATE TABLE `sys_work_task` (
  `task_id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '任务ID',
  `title` varchar(255) NOT NULL COMMENT '任务标题',
  `description` text COMMENT '任务描述',
  `assignee_id` bigint(20) DEFAULT NULL COMMENT '负责人ID',
  `owner_id` bigint(20) DEFAULT NULL COMMENT '创建人/所有者ID',
  `priority` int(4) DEFAULT '1' COMMENT '优先级 (0:低, 1:中, 2:高)',
  `status` varchar(20) DEFAULT 'TODO' COMMENT '状态 (TODO, DOING, DONE)',
  `due_date` datetime DEFAULT NULL COMMENT '截止时间',
  `tags` varchar(500) DEFAULT NULL COMMENT '标签 (JSON数组)',
  `parent_id` bigint(20) DEFAULT NULL COMMENT '父任务ID',
  `create_by` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime DEFAULT NULL COMMENT '创建时间',
  `update_by` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime DEFAULT NULL COMMENT '更新时间',
  `del_flag` char(1) DEFAULT '0' COMMENT '删除标志 (0代表存在 2代表删除)',
  PRIMARY KEY (`task_id`),
  KEY `idx_assignee` (`assignee_id`),
  KEY `idx_owner` (`owner_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='协作任务表';
```

## 3. 接口设计 (API Design)

服务模块：`cloudflow-service-workflow` (复用现有服务以减少运维成本)
Controller: `WorkTaskController`

| 方法 | URL | 描述 |
| :--- | :--- | :--- |
| POST | `/work-task` | 创建任务 |
| PUT | `/work-task` | 更新任务信息 |
| PUT | `/work-task/status` | 更新状态 (看板拖拽) |
| DELETE | `/work-task/{taskId}` | 删除任务 |
| GET | `/work-task/{taskId}` | 获取详情 |
| GET | `/work-task/list` | 获取我的任务列表 (支持按状态、优先级筛选) |
| GET | `/work-task/kanban` | 获取看板数据 (按状态分组) |

## 4. 前端设计 (Frontend Design)

### 4.1 页面路由
*   `/task/list`: 现有的任务列表页，需升级。
*   `/task/board`: 新增看板页。

### 4.2 组件改造
1.  **统一任务模型 (TypeScript Interface)**
    前端需定义一个 `UnifiedTask` 接口，兼容 `WfTask` (流程) 和 `WorkTask` (协作)。
    ```typescript
    interface UnifiedTask {
      id: string;
      title: string;
      type: 'PROCESS' | 'WORK'; // 区分来源
      status: string;
      priority: number;
      assigneeName?: string;
      dueDate?: string;
      // ...
    }
    ```

2.  **看板组件 (`TaskBoard`)**
    *   使用 `dnd-kit` 或 `react-beautiful-dnd` 实现拖拽。
    *   三列布局：待处理 (TODO)、进行中 (DOING)、已完成 (DONE)。

3.  **任务列表页 (`TaskListPage`)**
    *   增加 Tab 切换：`全部` | `流程审批` | `协作任务`。
    *   列表项渲染逻辑需适配两种任务类型。

## 5. 实施步骤
1.  **后端**：
    *   创建 SQL 脚本 `00_sys_work_task.sql`。
    *   生成 Entity, Mapper, Service, Controller 代码。
2.  **前端**：
    *   定义 API 接口文件 `services/api/workTask.ts`。
    *   开发看板组件 `components/TaskBoard/index.tsx`。
    *   改造 `TaskListPage.tsx`。

## 6. 注意事项
*   **权限控制**：目前设计为“谁创建谁管理”+“负责人可操作”。暂不引入复杂的 ACL。
*   **通知联动**：当任务分配给某人时，应发送 WebSocket 通知 (复用 `SysNoticeService`)。
