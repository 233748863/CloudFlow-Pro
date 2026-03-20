# 需求文档：HR人力资源管理微服务

## 简介

CloudFlow Pro HR微服务（cloudflow-service-hr）是一个企业级人力资源管理系统，专注于组织架构、员工全生命周期、考勤管理和薪酬结构配置。本服务作为CloudFlow Pro微服务平台的核心模块，与认证服务、工作流服务深度集成，提供完整的HR管理能力。

## 术语表

- **HR_Service**: HR人力资源管理微服务系统
- **Organization_Module**: 组织架构管理模块
- **Employee_Module**: 员工生命周期管理模块
- **Attendance_Module**: 考勤管理模块
- **Salary_Module**: 薪酬管理模块
- **Workflow_Service**: CloudFlow Pro工作流服务
- **Auth_Service**: CloudFlow Pro认证服务
- **Tenant**: 租户，多租户隔离的基本单位
- **Department**: 部门，组织架构的基本单元
- **Position**: 职位，岗位的抽象定义
- **Job_Level**: 职级，职位的等级划分
- **Employee**: 员工，系统管理的人员实体
- **Shift**: 班次，考勤排班的时间段定义
- **Leave_Quota**: 假期额度，员工可用的假期天数
- **Salary_Structure**: 薪资结构，薪资组成项目的配置
- **Recruitment_Request**: 招聘需求，职位招聘的申请记录
- **Candidate**: 候选人，应聘者信息记录
- **Interview**: 面试，面试安排和评价记录
- **Offer**: 录用通知，向候选人发出的录用邀约

## 需求

### 需求 1：组织架构管理（混合方案）

**用户故事：** 作为HR管理员，我希望管理公司的组织架构，以便清晰地定义部门层级、职位体系和汇报关系。

**架构说明：**
- **复用Auth_Service功能**：部门基础信息（sys_dept）、岗位基础信息（sys_post）、用户岗位关联（sys_user_post）
- **HR_Service扩展功能**：职位族、职级体系、职位管理、编制管理、汇报关系、职位描述
- **数据同步机制**：HR_Service通过Feign调用Auth_Service获取部门和岗位信息，维护dept_id和post_id外键关联

#### 验收标准（复用Auth_Service）

1. WHEN HR管理员创建部门 THEN THE Organization_Module SHALL 调用Auth_Service的部门创建接口并传递部门名称、父部门ID、负责人、联系方式
2. WHEN HR管理员查询部门树 THEN THE Organization_Module SHALL 调用Auth_Service的部门查询接口并返回完整的部门层级结构
3. WHEN HR管理员创建岗位 THEN THE Organization_Module SHALL 调用Auth_Service的岗位创建接口并传递岗位编码、岗位名称、排序
4. WHEN HR管理员查询岗位列表 THEN THE Organization_Module SHALL 调用Auth_Service的岗位查询接口并返回岗位基础信息

#### 验收标准（HR_Service扩展功能）

5. WHEN HR管理员创建职位族 THEN THE Organization_Module SHALL 创建职位族记录并包含族名称、族编码、描述（如技术族、产品族、运营族）
6. WHEN HR管理员创建职级 THEN THE Organization_Module SHALL 创建职级记录并包含职级编码、职级名称、职级序列（如P1-P10、M1-M5）
7. WHEN HR管理员创建职位 THEN THE Organization_Module SHALL 创建职位记录并关联职位族、职级、岗位ID（post_id）
8. WHEN HR管理员配置职位描述 THEN THE Organization_Module SHALL 记录职位的岗位职责、任职要求、工作内容
9. WHEN HR管理员设置部门编制 THEN THE Organization_Module SHALL 记录部门ID（dept_id）的编制人数并支持与实际人数对比
10. WHEN HR管理员设置岗位编制 THEN THE Organization_Module SHALL 记录岗位ID（post_id）的编制人数并支持与实际人数对比
11. WHEN HR管理员配置汇报关系 THEN THE Organization_Module SHALL 创建汇报关系记录并支持直接汇报和虚线汇报两种类型
12. WHEN HR管理员查询汇报关系矩阵 THEN THE Organization_Module SHALL 返回员工的直接汇报人和虚线汇报人信息

#### 验收标准（数据同步与关联）

13. WHEN HR_Service启动时 THEN THE Organization_Module SHALL 验证与Auth_Service的连接并缓存部门和岗位基础数据
14. WHEN Auth_Service的部门或岗位数据变更 THEN THE Organization_Module SHALL 通过定时任务或消息队列同步更新本地缓存
15. WHEN HR管理员查询职位详情 THEN THE Organization_Module SHALL 通过dept_id和post_id关联查询Auth_Service获取部门和岗位基础信息
16. WHEN Auth_Service的部门被删除 THEN THE Organization_Module SHALL 检测到关联的dept_id失效并标记相关职位为无效状态
17. WHEN HR管理员删除职位 THEN THE Organization_Module SHALL 验证该职位是否有在职员工，如有则拒绝删除

### 需求 2：员工档案管理

**用户故事：** 作为HR管理员，我希望管理员工的完整档案信息，以便记录和查询员工的基础信息、合同信息和证件信息。

#### 验收标准

1. WHEN HR管理员创建员工档案 THEN THE Employee_Module SHALL 创建员工记录并包含基础信息（姓名、性别、出生日期、联系方式）
2. WHEN HR管理员添加合同信息 THEN THE Employee_Module SHALL 记录合同类型、签订日期、到期日期和合同文件
3. WHEN HR管理员添加证件信息 THEN THE Employee_Module SHALL 记录身份证、护照、学历证书等证件信息和扫描件
4. WHEN HR管理员添加紧急联系人 THEN THE Employee_Module SHALL 记录紧急联系人姓名、关系和联系方式
5. WHEN HR管理员上传员工文件 THEN THE Employee_Module SHALL 存储文件并记录版本号和上传时间
6. WHEN HR管理员查询员工档案 THEN THE Employee_Module SHALL 根据数据权限返回员工的完整档案信息
7. WHEN 合同到期前30天 THEN THE Employee_Module SHALL 生成合同到期提醒通知

### 需求 3：员工入职流程

**用户故事：** 作为HR管理员，我希望管理员工的入职流程，以便规范化地完成新员工的入职手续。

#### 验收标准

1. WHEN HR管理员发起入职申请 THEN THE Employee_Module SHALL 创建入职申请记录并调用Workflow_Service启动入职审批流程
2. WHEN 入职审批通过 THEN THE Employee_Module SHALL 更新申请状态为"待入职"并生成入职任务清单
3. WHEN HR管理员完成资料收集 THEN THE Employee_Module SHALL 标记资料收集任务为已完成
4. WHEN HR管理员触发账号开通 THEN THE Employee_Module SHALL 调用Auth_Service创建用户账号并分配初始权限
5. WHEN HR管理员确认入职 THEN THE Employee_Module SHALL 更新员工状态为"在职"并记录入职日期
6. WHEN 入职流程中任一步骤失败 THEN THE Employee_Module SHALL 记录失败原因并允许重试

### 需求 4：员工转正流程

**用户故事：** 作为HR管理员，我希望管理员工的转正流程，以便在试用期结束后完成员工转正评估和审批。

#### 验收标准

1. WHEN 员工试用期到期前15天 THEN THE Employee_Module SHALL 生成转正提醒通知
2. WHEN HR管理员发起转正申请 THEN THE Employee_Module SHALL 创建转正申请记录并调用Workflow_Service启动转正审批流程
3. WHEN 转正审批通过 THEN THE Employee_Module SHALL 更新员工状态为"正式员工"并记录转正日期
4. WHEN 转正审批拒绝 THEN THE Employee_Module SHALL 更新员工状态为"试用期延长"或"离职"并记录原因

### 需求 5：员工调岗流程

**用户故事：** 作为HR管理员，我希望管理员工的调岗流程，以便规范化地完成员工的部门调动和岗位调整。

#### 验收标准

1. WHEN HR管理员发起调岗申请 THEN THE Employee_Module SHALL 创建调岗申请记录并调用Workflow_Service启动调岗审批流程
2. WHEN 调岗审批通过 THEN THE Employee_Module SHALL 更新员工的部门、岗位和汇报关系并记录生效日期
3. WHEN 调岗生效 THEN THE Employee_Module SHALL 记录调岗历史并保留原部门和岗位信息
4. WHEN 调岗涉及薪资变更 THEN THE Employee_Module SHALL 同步触发调薪流程

### 需求 6：员工离职流程

**用户故事：** 作为HR管理员，我希望管理员工的离职流程，以便规范化地完成员工的离职手续和账号注销。

#### 验收标准

1. WHEN 员工或HR管理员发起离职申请 THEN THE Employee_Module SHALL 创建离职申请记录并调用Workflow_Service启动离职审批流程
2. WHEN 离职审批通过 THEN THE Employee_Module SHALL 生成离职交接清单并分配给相关人员
3. WHEN HR管理员完成离职面谈 THEN THE Employee_Module SHALL 记录面谈内容和离职原因
4. WHEN HR管理员确认离职 THEN THE Employee_Module SHALL 更新员工状态为"已离职"并记录离职日期
5. WHEN 员工离职确认后 THEN THE Employee_Module SHALL 调用Auth_Service注销用户账号并回收权限
6. WHEN 员工离职 THEN THE Employee_Module SHALL 保留员工档案记录但标记为已离职状态

### 需求 7：排班规则管理

**用户故事：** 作为HR管理员，我希望配置灵活的排班规则，以便支持固定班、轮班、弹性工作制等多种工作模式。

#### 验收标准

1. WHEN HR管理员创建班次 THEN THE Attendance_Module SHALL 创建班次记录并包含上班时间、下班时间、休息时长
2. WHEN HR管理员创建排班规则 THEN THE Attendance_Module SHALL 支持配置固定班、轮班、弹性工作制、综合工时制四种类型
3. WHEN HR管理员创建排班计划 THEN THE Attendance_Module SHALL 支持按周或按月为员工或部门分配班次
4. WHEN HR管理员使用班次模板 THEN THE Attendance_Module SHALL 支持保存和复用常用的排班模板
5. WHEN HR管理员批量排班 THEN THE Attendance_Module SHALL 支持为多个员工同时分配相同的班次计划
6. WHEN 排班计划与员工假期冲突 THEN THE Attendance_Module SHALL 自动调整排班或提示冲突

### 需求 8：打卡管理

**用户故事：** 作为员工，我希望通过多种方式完成打卡，以便记录我的出勤情况。

#### 验收标准

1. WHEN 员工使用APP定位打卡 THEN THE Attendance_Module SHALL 验证GPS坐标是否在允许范围内并记录打卡时间和位置
2. WHEN 员工使用WiFi打卡 THEN THE Attendance_Module SHALL 验证WiFi SSID是否在白名单内并记录打卡时间
3. WHEN 员工使用人脸识别打卡 THEN THE Attendance_Module SHALL 调用人脸识别服务验证身份并记录打卡时间
4. WHEN 员工忘记打卡 THEN THE Attendance_Module SHALL 允许员工提交补卡申请并调用Workflow_Service启动审批流程
5. WHEN 补卡审批通过 THEN THE Attendance_Module SHALL 补充打卡记录并标记为补卡
6. WHEN 员工打卡时间早于班次开始时间超过阈值 THEN THE Attendance_Module SHALL 记录为早到
7. WHEN 员工打卡时间晚于班次开始时间超过阈值 THEN THE Attendance_Module SHALL 记录为迟到
8. WHEN 员工打卡时间早于班次结束时间超过阈值 THEN THE Attendance_Module SHALL 记录为早退

### 需求 9：假期管理

**用户故事：** 作为HR管理员，我希望管理假期类型和额度，以便员工可以申请各类假期并自动扣减额度。

#### 验收标准

1. WHEN HR管理员创建假期类型 THEN THE Attendance_Module SHALL 创建假期类型记录并配置是否需要额度、是否带薪、计算单位（天/小时）
2. WHEN 员工入职 THEN THE Attendance_Module SHALL 根据入职日期自动计算年假额度并初始化假期账户
3. WHEN 员工加班转调休 THEN THE Attendance_Module SHALL 根据加班时长计算调休额度并累加到调休账户
4. WHEN 假期额度到期 THEN THE Attendance_Module SHALL 根据过期规则自动清零或结转额度
5. WHEN 员工申请请假 THEN THE Attendance_Module SHALL 验证假期额度是否充足并调用Workflow_Service启动请假审批流程
6. WHEN 请假审批通过 THEN THE Attendance_Module SHALL 扣减对应假期额度并生成请假记录
7. WHEN 请假审批拒绝 THEN THE Attendance_Module SHALL 释放冻结的假期额度
8. WHEN 员工撤销请假 THEN THE Attendance_Module SHALL 恢复已扣减的假期额度

### 需求 10：加班管理

**用户故事：** 作为员工，我希望申请加班并获得审批，以便记录我的加班时长并转换为调休或加班费。

#### 验收标准

1. WHEN 员工申请加班 THEN THE Attendance_Module SHALL 创建加班申请记录并调用Workflow_Service启动加班审批流程
2. WHEN 加班审批通过 THEN THE Attendance_Module SHALL 记录加班时长并根据配置转换为调休额度或加班费
3. WHEN 加班审批拒绝 THEN THE Attendance_Module SHALL 更新申请状态为已拒绝并记录原因
4. WHEN 员工加班时长超过每日上限 THEN THE Attendance_Module SHALL 拒绝申请并返回错误提示
5. WHEN 加班转调休 THEN THE Attendance_Module SHALL 根据加班类型（工作日/周末/节假日）应用不同的转换比例

### 需求 11：考勤统计

**用户故事：** 作为HR管理员，我希望查看考勤统计报表，以便了解员工的出勤情况和考勤异常。

#### 验收标准

1. WHEN HR管理员查询月度考勤汇总 THEN THE Attendance_Module SHALL 返回指定月份的出勤天数、迟到次数、早退次数、请假天数、加班时长
2. WHEN HR管理员查询异常考勤统计 THEN THE Attendance_Module SHALL 返回旷工、缺卡、迟到、早退的详细记录
3. WHEN HR管理员查询出勤率分析 THEN THE Attendance_Module SHALL 计算并返回部门或个人的出勤率百分比
4. WHEN HR管理员导出考勤报表 THEN THE Attendance_Module SHALL 生成Excel格式的考勤报表文件
5. WHEN 员工缺卡且未补卡 THEN THE Attendance_Module SHALL 在考勤统计中标记为缺卡异常
6. WHEN 员工旷工（全天未打卡且无请假） THEN THE Attendance_Module SHALL 在考勤统计中标记为旷工

### 需求 12：薪资结构配置

**用户故事：** 作为HR管理员，我希望配置薪资结构和薪资项目，以便为不同职级的员工定义薪资组成。

#### 验收标准

1. WHEN HR管理员创建薪资项目 THEN THE Salary_Module SHALL 创建薪资项目记录并配置项目类型（固定/浮动）、是否计税
2. WHEN HR管理员创建薪资结构 THEN THE Salary_Module SHALL 创建薪资结构记录并关联多个薪资项目
3. WHEN HR管理员配置薪资等级表 THEN THE Salary_Module SHALL 为每个职级设置薪资范围（最低值、最高值、中位值）
4. WHEN HR管理员为员工分配薪资结构 THEN THE Salary_Module SHALL 关联员工与薪资结构并记录各项目的具体金额
5. WHEN HR管理员查询薪资结构 THEN THE Salary_Module SHALL 根据数据权限返回薪资结构配置信息

### 需求 13：调薪管理

**用户故事：** 作为HR管理员，我希望管理员工的调薪流程，以便规范化地完成薪资调整和审批。

#### 验收标准

1. WHEN HR管理员发起调薪申请 THEN THE Salary_Module SHALL 创建调薪申请记录并调用Workflow_Service启动调薪审批流程
2. WHEN 调薪审批通过 THEN THE Salary_Module SHALL 更新员工的薪资项目金额并记录生效日期
3. WHEN 调薪生效 THEN THE Salary_Module SHALL 记录调薪历史并保留调薪前的薪资信息
4. WHEN HR管理员查询调薪历史 THEN THE Salary_Module SHALL 返回员工的所有调薪记录包含调薪前后金额和调薪原因

### 需求 14：五险一金配置

**用户故事：** 作为HR管理员，我希望配置五险一金的缴纳规则，以便为不同城市的员工应用正确的缴纳基数和比例。

#### 验收标准

1. WHEN HR管理员创建五险一金方案 THEN THE Salary_Module SHALL 创建方案记录并配置养老、医疗、失业、工伤、生育保险和公积金的缴纳比例
2. WHEN HR管理员配置缴纳基数 THEN THE Salary_Module SHALL 支持设置基数下限、上限和计算规则
3. WHEN HR管理员为城市配置政策 THEN THE Salary_Module SHALL 支持为不同城市配置不同的五险一金方案
4. WHEN HR管理员为员工分配五险一金方案 THEN THE Salary_Module SHALL 关联员工与方案并记录缴纳基数

### 需求 15：个税配置

**用户故事：** 作为HR管理员，我希望配置个人所得税规则，以便为薪资计算提供税率和扣除项配置。

#### 验收标准

1. WHEN HR管理员配置个税起征点 THEN THE Salary_Module SHALL 记录当前适用的个税起征点金额
2. WHEN HR管理员配置税率表 THEN THE Salary_Module SHALL 记录累进税率的各级税率和速算扣除数
3. WHEN HR管理员配置专项附加扣除 THEN THE Salary_Module SHALL 支持配置子女教育、继续教育、大病医疗、住房贷款利息、住房租金、赡养老人六项扣除标准
4. WHEN HR管理员为员工配置专项附加扣除 THEN THE Salary_Module SHALL 记录员工的各项扣除金额和生效期限

### 需求 16：招聘管理

**用户故事：** 作为HR招聘专员，我希望管理招聘流程，以便高效地完成职位发布、简历筛选、面试安排和候选人评估。

#### 验收标准

1. WHEN HR招聘专员创建招聘需求 THEN THE Employee_Module SHALL 创建招聘需求记录并包含职位名称、招聘人数、任职要求、薪资范围
2. WHEN 招聘需求创建后 THEN THE Employee_Module SHALL 调用Workflow_Service启动招聘需求审批流程
3. WHEN 招聘需求审批通过 THEN THE Employee_Module SHALL 更新需求状态为"招聘中"并支持发布到招聘渠道
4. WHEN 候选人投递简历 THEN THE Employee_Module SHALL 创建候选人记录并关联到招聘需求
5. WHEN HR招聘专员筛选简历 THEN THE Employee_Module SHALL 支持更新候选人状态为"待面试"、"不合适"或"待定"
6. WHEN HR招聘专员安排面试 THEN THE Employee_Module SHALL 创建面试记录并包含面试时间、面试官、面试轮次、面试类型（初试/复试/终试）
7. WHEN 面试官完成面试 THEN THE Employee_Module SHALL 支持录入面试评价和评分
8. WHEN HR招聘专员发起Offer THEN THE Employee_Module SHALL 创建Offer记录并调用Workflow_Service启动Offer审批流程
9. WHEN Offer审批通过 THEN THE Employee_Module SHALL 更新候选人状态为"待入职"并支持转换为入职流程
10. WHEN 候选人接受Offer THEN THE Employee_Module SHALL 自动触发入职流程并同步候选人信息到员工档案
11. WHEN 招聘需求完成 THEN THE Employee_Module SHALL 更新需求状态为"已完成"并记录实际招聘人数和招聘周期

### 需求 17：多租户隔离

**用户故事：** 作为系统架构师，我希望实现多租户数据隔离，以便不同企业的数据互不干扰。

#### 验收标准

1. WHEN 任何模块执行数据库查询 THEN THE HR_Service SHALL 自动添加tenant_id过滤条件
2. WHEN 任何模块创建数据记录 THEN THE HR_Service SHALL 自动填充当前租户的tenant_id
3. WHEN 跨租户访问数据 THEN THE HR_Service SHALL 拒绝访问并返回权限错误
4. WHEN 超级管理员查询数据 THEN THE HR_Service SHALL 允许跨租户查询但需要显式指定tenant_id

### 需求 18：数据权限控制

**用户故事：** 作为系统管理员，我希望控制用户的数据访问权限，以便用户只能查看和操作其权限范围内的数据。

#### 验收标准

1. WHEN 用户查询员工数据 THEN THE HR_Service SHALL 根据用户的部门数据权限过滤返回结果
2. WHEN 用户查询自己的数据 THEN THE HR_Service SHALL 允许查询个人数据权限范围内的信息
3. WHEN 用户修改员工数据 THEN THE HR_Service SHALL 验证用户是否有该员工的修改权限
4. WHEN HR管理员配置数据权限 THEN THE HR_Service SHALL 支持配置全部数据、本部门及下级部门、本部门、仅本人四种权限范围

### 需求 19：审计日志

**用户故事：** 作为系统管理员，我希望记录关键操作的审计日志，以便追溯数据变更和排查问题。

#### 验收标准

1. WHEN 用户执行关键操作（创建、修改、删除员工档案） THEN THE HR_Service SHALL 记录操作日志包含操作人、操作时间、操作类型、操作对象、变更内容
2. WHEN 用户执行审批操作 THEN THE HR_Service SHALL 记录审批日志包含审批人、审批时间、审批结果、审批意见
3. WHEN 用户查询审计日志 THEN THE HR_Service SHALL 根据查询条件返回日志记录并支持按时间、操作人、操作类型过滤
4. WHEN 审计日志达到保留期限 THEN THE HR_Service SHALL 根据配置归档或删除过期日志

### 需求 20：工作流集成

**用户故事：** 作为系统架构师，我希望集成工作流服务，以便所有审批流程通过统一的工作流引擎处理。

#### 验收标准

1. WHEN HR_Service发起审批流程 THEN THE HR_Service SHALL 调用Workflow_Service的流程启动接口并传递流程类型和业务数据
2. WHEN Workflow_Service完成审批 THEN THE Workflow_Service SHALL 回调HR_Service的审批结果接口并传递审批结果和审批意见
3. WHEN HR_Service接收审批结果 THEN THE HR_Service SHALL 根据审批结果更新业务数据状态
4. WHEN 审批流程异常 THEN THE HR_Service SHALL 记录异常信息并支持人工干预

### 需求 21：认证服务集成

**用户故事：** 作为系统架构师，我希望集成认证服务，以便实现用户信息同步和统一认证。

#### 验收标准

1. WHEN 员工入职确认 THEN THE HR_Service SHALL 调用Auth_Service创建用户账号并传递用户基础信息
2. WHEN 员工信息变更 THEN THE HR_Service SHALL 调用Auth_Service同步更新用户信息
3. WHEN 员工离职确认 THEN THE HR_Service SHALL 调用Auth_Service注销用户账号
4. WHEN Auth_Service账号创建失败 THEN THE HR_Service SHALL 记录失败原因并允许重试
5. WHEN HR_Service接收用户请求 THEN THE HR_Service SHALL 验证Auth_Service颁发的JWT令牌并提取用户身份信息
