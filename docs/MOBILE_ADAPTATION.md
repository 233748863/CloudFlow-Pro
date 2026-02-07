# CloudFlow Pro 移动端适配说明

## 1. 双端架构设计
本项目采用 **“单仓库、双路由”** 的策略来实现独立的移动端体验。与传统的响应式设计（RWD）不同，我们为移动端构建了完全独立的 UI 组件和路由配置，同时复用后端的 API 服务和前端的上下文逻辑（如 AuthContext）。

### 1.1 核心机制
*   **设备检测**: 应用初始化时，通过 `src/utils/device.ts` 检测 User-Agent。
*   **路由分发**: `src/router.tsx` 根据检测结果，动态加载 `desktopRoutes` 或 `mobileRoutes`。
*   **独立布局**:
    *   桌面端：`MainLayout` (侧边栏 + 顶部栏)
    *   移动端：`MobileLayout` (底部 Tab 导航)

## 2. 目录结构
```
src/
├── layouts/            # 桌面端布局
├── pages/              # 桌面端页面 (功能全集)
├── mobile/             # 移动端专用代码
│   ├── layouts/        # 移动端布局 (MobileLayout)
│   ├── pages/          # 移动端页面 (MobileDashboard, MobileVehicleBooking)
│   └── components/     # 移动端专用组件
└── utils/
    └── device.ts       # 设备检测工具
```

## 3. 已实现的移动端功能
1.  **移动端首页 (Dashboard)**:
    *   展示问候语、通知角标。
    *   快捷功能入口（用车、请假等）。
    *   核心数据统计卡片。
    *   待办事项与日程预览。
2.  **公务车申请 (Vehicle Booking)**:
    *   步骤条式表单设计 (选择车辆 -> 填写详情 -> 确认提交)。
    *   针对触摸优化的输入控件。
3.  **底部导航**:
    *   支持首页、工作台、消息、我的四个 Tab 切换。

## 4. 开发指南
### 如何新增移动端页面
1.  在 `src/mobile/pages` 下创建新的页面组件（如 `MobileTaskList.tsx`）。
2.  在 `src/router.tsx` 的 `mobileRoutes` 数组中添加路由配置。
3.  确保复用 `src/services` 下的 API 方法，保持数据逻辑一致。

### 调试方法
*   使用 Chrome DevTools 的 "Toggle device toolbar" (Ctrl+Shift+M)。
*   刷新页面以触发 User-Agent 检测（路由选择是在应用启动时进行的）。
