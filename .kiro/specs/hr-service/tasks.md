# 实施计划：HR人力资源管理微服务

## 概述

本实施计划将HR微服务的开发分解为离散的编码步骤，采用增量开发方式，每个任务都基于前一个任务构建。实施过程中将复用Auth服务的基础组织架构能力，HR服务专注于专业HR功能扩展。

## 任务列表

### 1. 项目初始化和基础设施搭建

- [x] 1.1 创建Spring Boot项目结构和基础配置
  - 创建cloudflow-service-hr模块
  - 配置pom.xml依赖（Spring Boot、Spring Cloud、MyBatis-Plus、Redis、RabbitMQ）
  - 配置application.yml（数据库、Redis、RabbitMQ、Feign客户端）
  - 创建包结构（controller、service、mapper、entity、dto、vo、client、config）
  - _验证需求：技术栈要求_

- [x] 1.2 配置多租户拦截器和数据权限拦截器
  - 实现TenantInterceptor自动添加tenant_id过滤
  - 实现DataScopeInterceptor根据用户权限过滤数据
  - 配置MyBatis-Plus拦截器链
  - _验证需求：17.1, 17.3, 18.1_

- [x] 1.3 实现全局异常处理器
  - 创建业务异常类（InsufficientQuotaException、PositionHasEmployeeException等）
  - 创建系统异常类（ServiceCallException、DataSyncException）
  - 实现GlobalExceptionHandler统一处理异常
  - _验证需求：错误处理要求_

- [x] 1.4 配置Feign客户端和降级策略
  - 创建AuthServiceClient接口（部门、岗位、用户管理接口）
  - 创建WorkflowServiceClient接口（流程启动、查询接口）
  - 实现Fallback降级类
  - 配置Feign超时和重试策略
  - _验证需求：20.1, 21.1_

### 2. 组织架构模块实现

- [x] 2.1 实现职位族和职级管理
  - 创建hr_position_family表和实体类
  - 创建hr_job_level表和实体类
  - 实现PositionFamilyService（CRUD操作）
  - 实现JobLevelService（CRUD操作）
  - 实现Controller层接口
  - _验证需求：1.5, 1.6_

- [x] 2.2 实现职位管理
  - 创建hr_position表和实体类
  - 实现PositionService（创建、更新、查询、删除）
  - 实现关联查询（职位族、职级、部门、岗位）
  - 实现删除前验证（检查是否有在职员工）
  - 实现Controller层接口
  - _验证需求：1.7, 1.15, 1.17_

- [x] 2.3 实现编制管理和汇报关系
  - 创建hr_headcount表和实体类
  - 创建hr_reporting_line表和实体类
  - 实现HeadcountService（设置编制、统计查询）
  - 实现ReportingLineService（设置汇报关系、查询汇报矩阵）
  - 实现Controller层接口
  - _验证需求：1.9, 1.10, 1.11, 1.12_

- [x] 2.4 实现部门岗位数据同步服务
  - 实现DeptPostSyncService（同步部门、同步岗位）
  - 实现启动时全量同步逻辑
  - 实现定时任务增量同步（@Scheduled每5分钟）
  - 实现RabbitMQ消息监听器实时同步
  - 实现Redis缓存管理
  - _验证需求：1.13, 1.14, 1.16_

### 3. 员工档案管理实现

- [x] 3.1 实现员工基础信息管理
  - 创建hr_employee表和实体类
  - 实现EmployeeService（创建、更新、查询员工档案）
  - 实现数据权限过滤（根据用户权限范围）
  - 实现Controller层接口
  - _验证需求：2.1, 18.1_

- [x] 3.2 实现员工合同管理
  - 创建hr_employee_contract表和实体类
  - 实现EmployeeContractService（添加、更新、查询合同）
  - 实现合同到期提醒定时任务（@Scheduled每天检查）
  - 实现Controller层接口
  - _验证需求：2.2, 2.7_

- [x] 3.3 实现员工证件和紧急联系人管理
  - 创建hr_employee_document表和实体类
  - 创建hr_emergency_contact表和实体类
  - 实现EmployeeDocumentService（添加、更新、查询证件）
  - 实现EmergencyContactService（添加、更新、查询联系人）
  - 集成MinIO文件上传服务
  - 实现Controller层接口
  - _验证需求：2.3, 2.4, 2.5_

### 4. 员工生命周期管理实现

- [x] 4.1 实现入职流程
  - 创建hr_onboarding_application表和实体类
  - 创建hr_onboarding_task表和实体类
  - 实现OnboardingService（创建申请、提交审批、审批通过处理）
  - 实现入职任务清单生成逻辑
  - 实现账号开通（调用AuthServiceClient）
  - 实现确认入职（更新员工状态、记录入职日期）
  - 实现Controller层接口
  - _验证需求：3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 4.2 实现转正流程
  - 创建hr_probation_confirmation表和实体类
  - 实现ProbationConfirmationService（创建申请、提交审批、审批通过处理）
  - 实现转正提醒定时任务（试用期到期前15天）
  - 实现Controller层接口
  - _验证需求：4.1, 4.2, 4.3, 4.4_

- [x] 4.3 实现调岗流程
  - 创建hr_transfer_application表和实体类
  - 实现TransferService（创建申请、提交审批、审批通过处理、调岗生效）
  - 实现调岗历史记录
  - 实现Controller层接口
  - _验证需求：5.1, 5.2, 5.3, 5.4_

- [x] 4.4 实现离职流程
  - 创建hr_resignation_application表和实体类
  - 创建hr_resignation_handover表和实体类
  - 实现ResignationService（创建申请、提交审批、审批通过处理）
  - 实现离职交接清单生成和管理
  - 实现离职面谈记录
  - 实现确认离职（更新员工状态、调用AuthServiceClient注销账号）
  - 实现Controller层接口
  - _验证需求：6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

### 5. 考勤管理模块实现

- [x] 5.1 实现班次和排班规则管理
  - 创建hr_shift表和实体类
  - 创建hr_schedule_rule表和实体类
  - 实现ShiftService（CRUD操作）
  - 实现ScheduleRuleService（CRUD操作）
  - 实现Controller层接口
  - _验证需求：7.1, 7.2_

- [x] 5.2 实现排班计划管理
  - 创建hr_schedule_plan表和实体类
  - 实现SchedulePlanService（创建排班、批量排班、发布排班）
  - 实现排班与假期冲突检测
  - 实现排班日历查询
  - 实现Controller层接口
  - _验证需求：7.3, 7.4, 7.5, 7.6_

- [x] 5.3 实现打卡管理
  - 创建hr_attendance_record表和实体类
  - 实现AttendanceService（上班打卡、下班打卡）
  - 实现GPS位置验证逻辑
  - 实现WiFi验证逻辑
  - 实现迟到、早退判断逻辑
  - 实现补卡申请和审批
  - 实现Controller层接口
  - _验证需求：8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8_

- [x] 5.4 实现假期管理
  - 创建hr_leave_type表和实体类
  - 创建hr_leave_quota表和实体类
  - 创建hr_leave_application表和实体类
  - 实现LeaveTypeService（CRUD操作）
  - 实现LeaveQuotaService（初始化额度、调整额度、查询额度）
  - 实现年假额度自动计算逻辑
  - 实现LeaveApplicationService（创建申请、提交审批、审批通过扣减额度、撤销恢复额度）
  - 实现Controller层接口
  - _验证需求：9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8_

- [x] 5.5 实现加班管理
  - 创建hr_overtime_application表和实体类
  - 实现OvertimeService（创建申请、提交审批、审批通过转换调休或加班费）
  - 实现加班转换规则（工作日、周末、节假日不同比例）
  - 实现加班统计查询
  - 实现Controller层接口
  - _验证需求：10.1, 10.2, 10.3, 10.4, 10.5_

- [x] 5.6 实现考勤统计
  - 创建hr_attendance_monthly表和实体类
  - 实现AttendanceStatisticsService（生成月度汇总、查询统计、异常统计）
  - 实现出勤率计算逻辑
  - 实现考勤报表导出（Excel）
  - 实现定时任务自动生成月度汇总
  - 实现Controller层接口
  - _验证需求：11.1, 11.2, 11.3, 11.4, 11.5, 11.6_

### 6. 薪酬管理模块实现

- [x] 6.1 实现薪资结构配置
  - 创建hr_salary_item表和实体类
  - 创建hr_salary_structure表和实体类
  - 创建hr_salary_structure_item表和实体类
  - 创建hr_salary_grade表和实体类
  - 实现SalaryItemService（CRUD操作）
  - 实现SalaryStructureService（CRUD操作、关联薪资项目）
  - 实现SalaryGradeService（设置薪资等级）
  - 实现Controller层接口
  - _验证需求：12.1, 12.2, 12.3, 12.5_

- [x] 6.2 实现员工薪资管理
  - 创建hr_employee_salary表和实体类
  - 实现EmployeeSalaryService（分配薪资结构、查询员工薪资）
  - 实现Controller层接口
  - _验证需求：12.4_

- [x] 6.3 实现调薪管理
  - 创建hr_salary_adjustment表和实体类
  - 实现SalaryAdjustmentService（创建申请、提交审批、审批通过更新薪资、调薪生效）
  - 实现调薪历史记录查询
  - 实现Controller层接口
  - _验证需求：13.1, 13.2, 13.3, 13.4_

- [x] 6.4 实现五险一金配置
  - 创建hr_insurance_scheme表和实体类
  - 创建hr_employee_insurance表和实体类
  - 实现InsuranceSchemeService（CRUD操作）
  - 实现EmployeeInsuranceService（分配方案、查询、计算五险一金）
  - 实现Controller层接口
  - _验证需求：14.1, 14.2, 14.3, 14.4_

- [x] 6.5 实现个税配置
  - 创建hr_tax_config表和实体类
  - 创建hr_employee_tax_deduction表和实体类
  - 实现TaxConfigService（CRUD操作）
  - 实现EmployeeTaxDeductionService（添加、更新、查询专项扣除）
  - 实现个税计算逻辑
  - 实现Controller层接口
  - _验证需求：15.1, 15.2, 15.3, 15.4_

### 7. 招聘管理模块实现

- [x] 7.1 实现招聘需求管理
  - 创建hr_recruitment_request表和实体类
  - 实现RecruitmentRequestService（创建需求、提交审批、审批通过、完成招聘、取消招聘）
  - 实现Controller层接口
  - _验证需求：16.1, 16.2, 16.3, 16.11_

- [x] 7.2 实现候选人管理
  - 创建hr_candidate表和实体类
  - 实现CandidateService（创建候选人、更新信息、更新状态、查询）
  - 实现简历文件上传
  - 实现Controller层接口
  - _验证需求：16.4, 16.5_

- [x] 7.3 实现面试管理
  - 创建hr_interview表和实体类
  - 实现InterviewService（安排面试、更新面试、完成面试评价、取消面试）
  - 实现Controller层接口
  - _验证需求：16.6, 16.7_

- [x] 7.4 实现Offer管理
  - 创建hr_offer表和实体类
  - 实现OfferService（创建Offer、提交审批、审批通过、发送Offer、接受/拒绝Offer、转换为入职流程）
  - 实现Controller层接口
  - _验证需求：16.8, 16.9, 16.10_

### 8. 工作流集成和审计日志

- [x] 8.1 实现工作流回调处理
  - 创建WorkflowCallbackController
  - 实现审批结果回调接口
  - 实现业务类型分发器（入职、转正、调岗、离职、请假、加班、调薪、招聘需求、Offer、补卡）
  - 实现各业务类型的审批结果处理器
  - _验证需求：20.2, 20.3, 20.4_

- [x] 8.2 实现审计日志
  - 创建hr_audit_log表和实体类
  - 实现AuditLogService（记录操作日志、记录审批日志、查询日志）
  - 实现AOP切面自动记录关键操作
  - 实现日志归档定时任务
  - 实现Controller层接口
  - _验证需求：19.1, 19.2, 19.3, 19.4_

### 9. 系统集成和联调

- [x] 9.1 集成Auth服务
  - 测试部门查询接口
  - 测试岗位查询接口
  - 测试用户创建接口
  - 测试用户更新接口
  - 测试用户注销接口
  - 验证Fallback降级逻辑
  - _验证需求：21.1, 21.2, 21.3, 21.4, 21.5_

- [x] 9.2 集成Workflow服务
  - 测试流程启动接口
  - 测试流程查询接口
  - 测试流程撤销接口
  - 测试审批结果回调
  - 验证各业务类型的流程
  - _验证需求：20.1, 20.2, 20.3_

- [x] 9.3 数据同步验证
  - 验证启动时全量同步
  - 验证定时任务增量同步
  - 验证RabbitMQ实时同步
  - 验证缓存更新逻辑
  - 验证失效检测逻辑
  - _验证需求：1.13, 1.14, 1.16_

### 10. 最终检查点

- [x] 10.1 功能完整性检查
  - 确保所有需求的验收标准都已实现
  - 确保所有API接口都已实现
  - 确保所有数据表都已创建
  - 确保所有服务集成都已完成

- [x] 10.2 代码质量检查
  - 确保所有代码都有中文注释
  - 确保异常处理完整
  - 确保日志记录完整
  - 确保事务管理正确

- [x] 10.3 性能和安全检查
  - 确保多租户隔离正确
  - 确保数据权限过滤正确
  - 确保索引创建完整
  - 确保关键接口性能达标

## 注意事项

1. **增量开发**：每个任务都基于前一个任务构建，确保代码可以逐步运行
2. **服务集成**：优先实现Feign客户端和降级策略，确保外部服务调用稳定
3. **数据同步**：组织架构模块依赖Auth服务数据，需要先实现数据同步机制
4. **工作流集成**：所有审批流程都依赖Workflow服务，需要先实现回调处理
5. **多租户隔离**：所有数据操作都需要自动添加tenant_id过滤
6. **数据权限**：所有查询都需要根据用户权限范围过滤数据
7. **审计日志**：所有关键操作都需要记录审计日志
8. **错误处理**：所有异常都需要统一处理并返回明确的错误信息
