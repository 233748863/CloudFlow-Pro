# 后端 API 开发需求文档

## 文档概述
本文档详细列出了为支持移动端前端功能所需开发的后端 API 接口。前端已完成所有必要的工具和基础设施准备，一旦后端 API 就绪即可快速集成。

**文档日期**: 2026年2月7日  
**前端准备状态**: ✅ 完全就绪  
**后端开发状态**: ⏳ 待开发

---

## 📋 前端已准备的基础设施

### 已完成的工具和 Hooks
- ✅ **useApiCache** - API 缓存机制，支持自动过期和刷新
- ✅ **usePullToRefresh** - 下拉刷新功能
- ✅ **useKeyboardHeight** - 键盘检测和自动滚动
- ✅ **useGestures** - 完整的手势支持库
- ✅ **sanitize** - XSS 防护工具集
- ✅ 统一的错误处理和加载状态管理
- ✅ 统一的设计系统和 UI 组件库

### 已完成的移动端页面
- ✅ MobileDashboard - 首页（需要真实数据）
- ✅ MobileProfile - 个人中心
- ✅ MobileVehicleBooking - 用车申请

---

## 🎯 API 开发优先级

### P0 - 高优先级（核心功能）
1. **任务管理 API** - 工作流核心功能
2. **消息管理 API** - 通知和沟通核心
3. **Dashboard 数据 API** - 用户最常用的首页数据

### P1 - 中优先级（增强体验）
4. **日程管理 API** - 时间管理功能
5. **公告管理 API** - 信息传达
6. **工作台 API** - 工作台概览

### P2 - 低优先级（可选功能）
7. **离线同步 API** - PWA 离线支持

---

## 📡 API 接口详细规范

### 1. 任务管理 API

#### 1.1 获取待办任务列表
```
GET /api/tasks/pending
```

**查询参数**:
- `page` (可选): 页码，默认 1
- `pageSize` (可选): 每页数量，默认 20
- `priority` (可选): 优先级筛选 (high/medium/low)

**响应示例**:
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "total": 45,
    "list": [
      {
        "id": "task_001",
        "title": "审批：2024年度部门预算申请",
        "description": "需要审批财务部门提交的年度预算",
        "applicant": {
          "id": "user_123",
          "name": "王财务",
          "avatar": "https://..."
        },
        "priority": "high",
        "deadline": "2026-02-07T18:00:00Z",
        "status": "pending",
        "type": "approval",
        "createdAt": "2026-02-05T10:00:00Z"
      }
    ]
  }
}
```

#### 1.2 获取任务统计
```
GET /api/tasks/count
```

**响应示例**:
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "pending": 12,
    "completed": 45,
    "overdue": 3,
    "total": 60
  }
}
```

#### 1.3 获取任务详情
```
GET /api/tasks/:id
```

**响应示例**:
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "id": "task_001",
    "title": "审批：2024年度部门预算申请",
    "description": "详细描述...",
    "applicant": {...},
    "priority": "high",
    "deadline": "2026-02-07T18:00:00Z",
    "status": "pending",
    "type": "approval",
    "attachments": [],
    "comments": [],
    "history": [],
    "createdAt": "2026-02-05T10:00:00Z",
    "updatedAt": "2026-02-05T10:00:00Z"
  }
}
```

#### 1.4 完成任务
```
POST /api/tasks/:id/complete
```

**请求体**:
```json
{
  "comment": "任务已完成",
  "result": "success"
}
```

**响应示例**:
```json
{
  "code": 200,
  "message": "任务已完成",
  "data": {
    "id": "task_001",
    "status": "completed",
    "completedAt": "2026-02-07T15:30:00Z"
  }
}
```

#### 1.5 审批任务
```
POST /api/tasks/:id/approve
```

**请求体**:
```json
{
  "action": "approve",  // approve | reject
  "comment": "审批意见",
  "signature": "签名数据（可选）"
}
```

**响应示例**:
```json
{
  "code": 200,
  "message": "审批成功",
  "data": {
    "id": "task_001",
    "status": "approved",
    "approvedAt": "2026-02-07T15:30:00Z",
    "approver": {
      "id": "user_456",
      "name": "李经理"
    }
  }
}
```

---

### 2. 日程管理 API

#### 2.1 获取今日日程
```
GET /api/schedule/today
```

**响应示例**:
```json
{
  "code": 200,
  "message": "success",
  "data": [
    {
      "id": "schedule_001",
      "title": "产品发布会筹备会议",
      "startTime": "2026-02-07T10:00:00Z",
      "endTime": "2026-02-07T11:30:00Z",
      "location": "会议室 A301",
      "type": "meeting",
      "participants": [
        {
          "id": "user_123",
          "name": "张三",
          "avatar": "https://..."
        }
      ],
      "reminder": 15,  // 提前15分钟提醒
      "status": "confirmed"
    }
  ]
}
```

#### 2.2 获取日程列表
```
GET /api/schedule/list
```

**查询参数**:
- `startDate` (必需): 开始日期 (YYYY-MM-DD)
- `endDate` (必需): 结束日期 (YYYY-MM-DD)
- `type` (可选): 日程类型 (meeting/event/task)

**响应示例**: 同 2.1

#### 2.3 创建日程
```
POST /api/schedule/create
```

**请求体**:
```json
{
  "title": "团队周会",
  "startTime": "2026-02-08T14:00:00Z",
  "endTime": "2026-02-08T15:00:00Z",
  "location": "会议室 B201",
  "type": "meeting",
  "description": "讨论本周工作进展",
  "participants": ["user_123", "user_456"],
  "reminder": 15
}
```

**响应示例**:
```json
{
  "code": 200,
  "message": "日程创建成功",
  "data": {
    "id": "schedule_002",
    "title": "团队周会",
    ...
  }
}
```

#### 2.4 更新日程
```
PUT /api/schedule/:id
```

**请求体**: 同 2.3

#### 2.5 删除日程
```
DELETE /api/schedule/:id
```

**响应示例**:
```json
{
  "code": 200,
  "message": "日程已删除"
}
```

---

### 3. 消息管理 API

#### 3.1 获取未读消息数量
```
GET /api/messages/unread
```

**响应示例**:
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "count": 5,
    "hasNew": true
  }
}
```

#### 3.2 获取消息列表
```
GET /api/messages/list
```

**查询参数**:
- `page` (可选): 页码，默认 1
- `pageSize` (可选): 每页数量，默认 20
- `type` (可选): 消息类型 (system/task/announcement)
- `status` (可选): 状态 (read/unread)

**响应示例**:
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "total": 25,
    "unreadCount": 5,
    "list": [
      {
        "id": "msg_001",
        "type": "task",
        "title": "新任务分配",
        "content": "您有一个新的审批任务",
        "sender": {
          "id": "user_123",
          "name": "系统",
          "avatar": "https://..."
        },
        "isRead": false,
        "createdAt": "2026-02-07T14:30:00Z",
        "relatedId": "task_001",  // 关联的任务/公告等ID
        "relatedType": "task"
      }
    ]
  }
}
```

#### 3.3 获取消息详情
```
GET /api/messages/:id
```

**响应示例**: 同 3.2 中的单条消息格式

#### 3.4 标记消息已读
```
POST /api/messages/:id/read
```

**响应示例**:
```json
{
  "code": 200,
  "message": "已标记为已读",
  "data": {
    "id": "msg_001",
    "isRead": true,
    "readAt": "2026-02-07T15:30:00Z"
  }
}
```

#### 3.5 删除消息
```
DELETE /api/messages/:id
```

**响应示例**:
```json
{
  "code": 200,
  "message": "消息已删除"
}
```

---

### 4. 公告管理 API

#### 4.1 获取最新公告
```
GET /api/announcements/latest
```

**查询参数**:
- `limit` (可选): 返回数量，默认 5

**响应示例**:
```json
{
  "code": 200,
  "message": "success",
  "data": [
    {
      "id": "ann_001",
      "title": "系统维护通知",
      "content": "系统将于本周六进行维护...",
      "type": "system",  // system/notice/urgent
      "priority": "high",
      "publisher": {
        "id": "user_admin",
        "name": "系统管理员",
        "avatar": "https://..."
      },
      "publishedAt": "2026-02-07T09:00:00Z",
      "isRead": false,
      "attachments": []
    }
  ]
}
```

#### 4.2 获取公告列表
```
GET /api/announcements/list
```

**查询参数**:
- `page` (可选): 页码，默认 1
- `pageSize` (可选): 每页数量，默认 20
- `type` (可选): 公告类型
- `status` (可选): 状态 (read/unread)

**响应示例**: 同 4.1

#### 4.3 获取公告详情
```
GET /api/announcements/:id
```

**响应示例**: 同 4.1 中的单条公告格式

#### 4.4 标记公告已读
```
POST /api/announcements/:id/read
```

**响应示例**:
```json
{
  "code": 200,
  "message": "已标记为已读",
  "data": {
    "id": "ann_001",
    "isRead": true,
    "readAt": "2026-02-07T15:30:00Z"
  }
}
```

---

### 5. 工作台 API

#### 5.1 获取工作台概览
```
GET /api/workplace/summary
```

**响应示例**:
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "user": {
      "id": "user_123",
      "name": "张三",
      "avatar": "https://...",
      "department": "技术部",
      "position": "高级工程师"
    },
    "statistics": {
      "pendingTasks": 12,
      "todaySchedules": 3,
      "unreadMessages": 5,
      "completedThisWeek": 15
    },
    "quickActions": [
      {
        "id": "action_001",
        "label": "用车申请",
        "icon": "car",
        "path": "/vehicle/booking",
        "color": "#3b82f6"
      }
    ]
  }
}
```

#### 5.2 获取最近任务
```
GET /api/workplace/recent-tasks
```

**查询参数**:
- `limit` (可选): 返回数量，默认 10

**响应示例**:
```json
{
  "code": 200,
  "message": "success",
  "data": [
    {
      "id": "task_001",
      "title": "审批：2024年度部门预算申请",
      "status": "pending",
      "updatedAt": "2026-02-07T14:30:00Z"
    }
  ]
}
```

---

### 6. 离线同步 API（可选 - P2）

#### 6.1 上传离线数据
```
POST /api/sync/upload
```

**请求体**:
```json
{
  "deviceId": "device_123",
  "timestamp": "2026-02-07T15:30:00Z",
  "data": [
    {
      "type": "task_complete",
      "id": "task_001",
      "action": "complete",
      "payload": {...},
      "localTimestamp": "2026-02-07T15:25:00Z"
    }
  ]
}
```

**响应示例**:
```json
{
  "code": 200,
  "message": "同步成功",
  "data": {
    "synced": 5,
    "conflicts": 0,
    "failed": 0
  }
}
```

#### 6.2 下载增量数据
```
GET /api/sync/download
```

**查询参数**:
- `lastSyncTime` (必需): 上次同步时间戳
- `deviceId` (必需): 设备ID

**响应示例**:
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "tasks": [...],
    "messages": [...],
    "announcements": [...],
    "syncTime": "2026-02-07T15:30:00Z"
  }
}
```

#### 6.3 解决冲突
```
POST /api/sync/resolve-conflicts
```

**请求体**:
```json
{
  "conflicts": [
    {
      "id": "conflict_001",
      "type": "task",
      "resolution": "server",  // server | client | merge
      "mergedData": {...}  // 如果选择 merge
    }
  ]
}
```

---

## 🔐 通用 API 规范

### 认证
所有 API 请求都需要在 Header 中包含认证令牌：
```
Authorization: Bearer <token>
```

### 错误响应格式
```json
{
  "code": 400,
  "message": "错误描述",
  "error": {
    "field": "具体字段",
    "reason": "错误原因"
  }
}
```

### 常见状态码
- `200` - 成功
- `201` - 创建成功
- `400` - 请求参数错误
- `401` - 未授权
- `403` - 禁止访问
- `404` - 资源不存在
- `500` - 服务器错误

### 分页规范
所有列表接口都应支持分页：
- 请求参数: `page`, `pageSize`
- 响应格式: `{ total, list }`

### 时间格式
所有时间字段使用 ISO 8601 格式：
```
2026-02-07T15:30:00Z
```

---

## 📝 前端集成示例

### 使用 useApiCache Hook
```typescript
import { useApiCache } from '@/hooks/useApiCache';
import { fetchTasks } from '@/services/api/tasks';

const { data, error, isLoading, refetch } = useApiCache(
  'pending-tasks',
  () => fetchTasks({ status: 'pending' }),
  {
    cacheTime: 5 * 60 * 1000,  // 5分钟缓存
    staleTime: 30 * 1000,       // 30秒过期
    refetchOnFocus: true,
  }
);
```

### 错误处理
```typescript
try {
  const result = await api.tasks.complete(taskId);
  toast.success('任务完成');
} catch (error) {
  toast.error(error.message || '操作失败');
}
```

---

## 🚀 开发建议

### 第一阶段（1-2周）
1. 实现任务管理 API（1.1 - 1.5）
2. 实现消息管理 API（3.1 - 3.5）
3. 实现 Dashboard 数据 API（工作台概览）

### 第二阶段（1-2周）
4. 实现日程管理 API（2.1 - 2.5）
5. 实现公告管理 API（4.1 - 4.4）
6. 前端集成测试

### 第三阶段（可选）
7. 实现离线同步 API（6.1 - 6.3）
8. PWA 完整支持

---

## 📞 联系方式

如有任何问题或需要澄清，请联系前端开发团队。

**文档版本**: 1.0  
**最后更新**: 2026年2月7日
