// ============================================================================
// hr.ts —— HR 服务 API 聚合入口（barrel）
//
// 历史：原文件单体 1656 行，含类型/字段兼容/默认值/缓存/跨模块聚合混合。
// 重构（P1-6）：按业务域拆分至 `hr/` 子目录，本文件仅做 re-export，保留对外
// `import { ... } from '@/services/api/hr'` 全部既有调用点的兼容性。
//
// 拆分结构：
//   - types               全部接口/类型定义
//   - employee            员工档案 + 紧急联系人
//   - organization        部门/岗位/职位/家族/职级
//   - self-service        当前员工解析、状态守卫与缓存
//   - attendance          考勤/请假/加班/班次/排班规则/工作日历
//   - recruitment         招聘需求/候选人/面试/Offer
//   - lifecycle           入职/转正/调岗/离职生命周期
//   - employee-records    员工合同 / 证件 / 编制
//   - compensation        薪酬/福利/社保/个税
//   - performance         绩效目标/分配 + CRM 业绩聚合
// ============================================================================

export * from './hr/types';
export * from './hr/employee';
export * from './hr/organization';
export * from './hr/self-service';
export * from './hr/attendance';
export * from './hr/recruitment';
export * from './hr/lifecycle';
export * from './hr/employee-records';
export * from './hr/compensation';
export * from './hr/performance';
