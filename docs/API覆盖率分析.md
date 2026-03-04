# API 覆盖率分析报告

## 文档概述
本文档分析 CloudFlow Pro 现有后端 API 与移动端需求的匹配情况，明确哪些 API 已存在、哪些需要新开发。

**文档日期**: 2026年2月7日  
**分析结果**: 大部分 API 已存在，只需少量补充

---

## 📊 总体覆盖率

| 类别 | 需求接口数 | 已存在 | 需新增 | 覆盖率 |
|------|-----------|--------|--------|--------|
| 任务管理 | 5 | 4 | 1 | 80% |
| 消息管理 | 5 | 3 | 2 | 60% |
| 日程管理 | 5 | 4 | 1 | 80% |
| 公告管理 | 4 | 4 | 0 | 100% |
| 工作台 | 2 | 0 | 2 | 0% |
| 离线同步 | 3 | 0 | 3 | 0% |
| **总计** | **24** | **15** | **9** | **63%** |

---

## ✅ 已存在的 API（可直接复用）

### 1. 任务管理 API（4/5 已存在）

#### ✅ 已存在
- **GET /api/workflow/todo** - 获取待办任务列表
  - 位置: `WorkflowController.java`
  - 功能: 获取当前用户的待办任务
  - 支持分页
  
- **GET /api/workflow/my-instances** - 获取我的流程实例
  - 位置: `WorkflowController.java`
  - 功能: 可用于获取任务统计
  
- **POST /api/workflow/complete** - 完成任务
  - 位置: `WorkflowController.java`
  - 功能: 完成工作流任务
  
- **POST /api/workflow/task/read/{taskId}** - 标记任务已读
  - 位置: `WorkflowController.java`
  - 功能: 标记任务为已读状态

#### ❌ 需新增
- **GET /api/tasks/count** - 获取任务统计
  - 说明: 虽然可以从 my-instances 推算，但建议添加专门的统计接口

### 2. 消息管理 API（3/5 已存在）

#### ✅ 已存在
- **GET /api/notice/list** - 获取消息列表
  - 位置: `SysNoticeController.java`
  - 功能: 获取通知消息列表
  - 支持分页
  
- **POST /api/notice/read/{noticeId}** - 标记消息已读
  - 位置: `SysNoticeController.java`
  - 功能: 标记通知为已读
  
- **GET /api/notice/unread-count** - 获取未读消息数量
  - 位置: `SysNoticeController.java`
  - 功能: 获取未读通知数量

#### ❌ 需新增
- **GET /api/messages/:id** - 获取消息详情
  - 说明: 需要添加单个消息详情接口
  
- **DELETE /api/messages/:id** - 删除消息
  - 说明: 需要添加删除消息接口

### 3. 日程管理 API（4/5 已存在）

#### ✅ 已存在
- **GET /api/schedule/my-events** - 获取我的日程
  - 位置: `SysScheduleController.java`
  - 功能: 获取用户日程事件
  - 支持时间范围筛选
  
- **POST /api/schedule** - 创建日程
  - 位置: `SysScheduleController.java`
  - 功能: 创建新的日程事件
  
- **PUT /api/schedule** - 更新日程
  - 位置: `SysScheduleController.java`
  - 功能: 更新日程事件
  
- **DELETE /api/schedule/{id}** - 删除日程
  - 位置: `SysScheduleController.java`
  - 功能: 删除日程事件

#### ❌ 需新增
- **GET /api/schedule/today** - 获取今日日程
  - 说明: 可以通过 my-events 加时间参数实现，但建议添加便捷接口

### 4. 公告管理 API（4/4 已存在）✅

#### ✅ 已存在
- **GET /api/announcement/my-list** - 获取我的公告列表
  - 位置: `SysAnnouncementController.java`
  - 功能: 获取用户可见的公告
  
- **GET /api/announcement/list** - 获取公告列表
  - 位置: `SysAnnouncementController.java`
  - 功能: 获取所有公告
  
- **POST /api/announcement/read/{id}** - 标记公告已读
  - 位置: `SysAnnouncementController.java`
  - 功能: 标记公告为已读
  
- **POST /api/announcement/publish** - 发布公告
  - 位置: `SysAnnouncementController.java`
  - 功能: 发布新公告

**说明**: 公告管理 API 已完全覆盖移动端需求！

### 5. 工作台 API（0/2 已存在）

#### ❌ 需新增
- **GET /api/workplace/summary** - 获取工作台概览
  - 说明: 需要新增，聚合多个数据源
  
- **GET /api/workplace/recent-tasks** - 获取最近任务
  - 说明: 需要新增

### 6. 离线同步 API（0/3 已存在）

#### ❌ 需新增（P2 优先级，可选）
- **POST /api/sync/upload** - 上传离线数据
- **GET /api/sync/download** - 下载增量数据
- **POST /api/sync/resolve-conflicts** - 解决冲突

---

## 🔧 需要新增的 API 详细说明

### 高优先级（P0）

#### 1. 工作台概览 API
```java
@RestController
@RequestMapping("/api/workplace")
public class WorkplaceController {
    
    @GetMapping("/summary")
    public R<WorkplaceSummary> getSummary() {
        // 聚合数据：
        // - 待办任务数量（从 workflow 服务）
        // - 今日日程数量（从 schedule 服务）
        // - 未读消息数量（从 notice 服务）
        //
