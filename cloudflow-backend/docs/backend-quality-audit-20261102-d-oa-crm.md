# D盘 OA、CRM 后端质量审计（2026-11-02）

审计目录 `D:\CloudFlowPro`，版本 `e0b9e7d27b7690e5eac5f3c02be55b59a52924bf`。本报告记录13项已确认的实现问题、2项需业务取舍的问题；未修改业务代码、SQL或配置。所有“建议验证”均未执行。

## 范围和判定

清单覆盖 OA 765个文件/56,659行、CRM 481个文件/31,710行，包括源码、资源与构建描述；全域检索之后，对下列链路核对服务、Mapper、实体、建表和必要的前端消费方。清单覆盖不代表每个方法均已逐行验证。历史数据全部可重建；保留权限、租户、事务、并发版本、幂等和真实业务约束。P1 = 优先处理的正确性或持续开销；P2 = 局部性能或契约收敛；P3 = 维护冗余。

路径缩写均相对D盘根：`OA` = `cloudflow-backend/cloudflow-service-oa/src/main/java/com/cloudflow/oa`；`CRM` = 对应crm目录；`DB` = `cloudflow-backend/DB`；`FE` = `cloudflow-frontend/src`。下列编号用于逐项回写，当前全部为“已审计，未改造”。

## 已确认的问题

### OC01｜P1｜客户工作台在同一次请求重复读取健康指标

证据：`CRM/service/impl/CrmCustomerWorkspaceServiceImpl.java:84–91`两次requireCustomer，之间调用refreshHealth；`CrmCustomerServiceImpl.java:227–258`内部又读取客户及跟进、续约、应收、工单指标；工作台230–258行的buildHealthReasons再次读取续约、逾期、工单数，97–122行又加载展示列表。查询实现见`CrmHealthCalculator.java:34–98`。

| 当前步骤 | 建议步骤 |
| --- | --- |
| 校验并读客户→刷新函数重读客户和指标→重读客户→说明函数重读指标→展示再读列表 | 一次确认本请求客户权限→加载各用途共享的数据→纯计算健康结果及说明→按既有语义写回并组装展示 |

重复SQL和对象装配明确存在，未测量耗时；属于实现重复，未发现旧数据理由。合并读取必须保持指标过滤条件、健康状态写回语义和当次权限，不跨请求复用授权。建议验证同客户完整工作台内容和SQL调用次数，覆盖无应收、已关闭工单、续约临界日期。

### OC02｜P1｜仪表盘全量取列表再截断，同请求重复查询可访问客户

证据：`CrmCustomerWorkspaceServiceImpl.java:137,285,385`重复accessibleCustomerIds(200)，665–670行实际执行数据库分页；152–162行报价查完再取8条，165–176行续约逐条补充后再过滤及取10条，177–189行工单查完再取10条；675–680行活动报价查完取4条。

| 当前步骤 | 建议步骤 |
| --- | --- |
| 多次查询同一访问范围→取全部业务行→逐条装配→内存过滤/截断 | 请求内取得一次访问范围→数据库按同一条件过滤/排序/限制条数→只装配结果 |

返回条数有上限，传输、转换仍随匹配总行数增长。属于查询位置与重复读取问题。保留租户、数据权限、排序及当前200客户范围；200上限是否合理另作业务决定。建议对比总量、排列和边界日期，确认下推筛选与原逻辑一致。

### OC03｜P2｜账龄规则在每笔应收上重复读Redis、排序，并保留两套桶编号

证据：`CrmCustomerWorkspaceServiceImpl.java:365–400`先读取/排序字典创建桶，每条应收396行又调用resolveAgingBucket；`CrmHealthCalculator.java:111–163`每次重新读取和排序，缺字典走DUE_30/60/90/90_PLUS，有字典走DUE_TIER_sort，缺sort再用indexOf猜编号。`common-redis/.../SysDictHelper.java:67–87`的getDictData直接Redis读取，故障或无缓存返回空列表。

| 当前步骤/字段 | 建议步骤/字段 |
| --- | --- |
| 先建桶→每行重新取字典、排序→字典缺失切另一套编号 | 请求开始读取一次规则快照→校验→建桶和分桶共用 |
| DUE_30等固定旧编号 / DUE_TIER_sort / 缺sort时索引 | 初始化定义唯一且稳定的桶标识，明确规则不可用时的结果 |

N条应收可产生N次额外Redis读取和排序。重复读取已确认；两套编号的全部外部消费方仍需改造时核对，不能只删缺缓存分支，导致缓存未就绪时报表失效。保留缺配置的明确处理与金额汇总精度。建议验证正常字典、空缓存和边界天数。

### OC04｜P2｜批量删除项目任务时按任务反复刷新同一项目

证据：`OA/service/impl/OaProjectTaskService.java:177–193`逐任务锁定/校验/删除后，在192行refreshTree并syncProjectStatus；同项目N任务会触发N轮项目刷新。146–172行saveTree已采用一次列表映射及全树版本检查，是应保留的较好实现。

| 当前步骤 | 建议步骤 |
| --- | --- |
| 每任务：锁与引用校验→删除→重建项目树→同步项目状态 | 按既有顺序完成锁与引用校验/删除→收集受影响项目→每项目刷新一次 |

属于批操作循环中的重复派生计算。保留项目锁、任务版本、子任务/工时/依赖/工作任务关联检查和事务回滚，不能恢复旧版用WorkTask代替项目任务的模型。建议验证同项目、多项目、删除受阻三种批次，比较刷新次数和最终项目状态。

### OC05｜P2｜部门负责人使用自由文本，调用方按三种身份猜测

证据：`OA/service/impl/OaOrganizationService.java:16–30`、`CRM/service/impl/CrmSlaService.java:250–260`读leader字符串并匹配候选；`OA/resources/mapper/OaIdentityReferenceMapper.xml:64–68`（resources位于模块src/main）与CRM的`CrmStaffMapper.xml:10–12`同时匹配CAST(user_id AS CHAR)、user_name、nick_name。`DB/01.cloudflow-common.sql:133`为leader VARCHAR(20)。

| 当前字段/步骤 | 建议字段/步骤 |
| --- | --- |
| leader文本→trim→用户ID/账号/昵称三路查询→排序挑选或歧义处理 | 负责人用户ID单字段→按同租户ID关联→展示名查询 |

存在多义身份与重复解析，且昵称可重名；不能只留第一项猜测。此项是跨模块根因，主报告与Workflow同类合并。保留停用校验、必要父部门查找、本人排除与父链环路检测；改造要统一部门编辑器及所有负责人消费方。建议验证重名、负责人离职、父部门升级和跨租户拒绝。

### OC06｜P1｜会议决议用Map多层兜底，掩盖真实字段不一致

证据：`OA/service/impl/OaMeetingMinutesServiceImpl.java:199–254`接收List<Map>，220–234行猜标题、描述、负责人、优先级和日期；310–315行解析失败返回空数组，326–363行数字/日期解析失败转默认值。`FE/services/api/meetingMinutes.ts:7–15`定义dueDate和remark，`FE/pages/MeetingMinutesPage.tsx:286,318–324,672–673`实际保存并原样派发。

| 字段 | 当前页面发送 | 当前后端读取 | 建议统一契约 |
| --- | --- | --- | --- |
| 截止日期 | dueDate | deadline，缺失则无到期日 | dueDate，明确LocalDate格式 |
| 备注 | remark | description，缺失则生成来源描述 | remark，明确如何合入任务说明 |
| 负责人 | ownerId | 非法数字静默转组织者 | ownerId，非法值拒绝；未填写的业务默认另明确 |

这是已可由调用链确定的日期丢失，不只是同结果的绕路。使用单一类型对象在入口校验一次，内部直接读字段；非法JSON应明确报错。保留已派发任务幂等、纪要访问权限与事务；`__unused__`方法367–370行可随关联清理删除。建议验证页面填日期/备注后任务内容、无效负责人和重复派发。

### OC07｜P2｜会议关联同义双字段导致双写、回退查询及一致性检查

证据：`OaMeetingMinutesServiceImpl.java:257–261`双字段冲突校验再回退，292行双写；`OaMeetingInvitationService.java:31–44`41行同写eventId。`src/main/resources/mapper/OaMeetingMinutesMapper.xml:7,12,13,29`及`OaMeetingMapper.xml:50`反复COALESCE两个字段。`DB/04.cloudflow-oa.sql:2763–2813`包含两张表字段及索引。

| 表 | 当前字段及含义 | 建议结构 |
| --- | --- | --- |
| oa_meeting_minutes | meeting_id和schedule_event_id均关联oa_schedule_event.event_id | 保留schedule_event_id；手工独立纪要允许空的语义继续保持 |
| oa_meeting_attendance | meeting_id和schedule_event_id在当前邀请写入方同值 | 保留schedule_event_id；minutes_id保留其纪要关系 |

当前双写和读时回退确认构成兼容冗余；实际表名由`SysScheduleEvent.java:17`的TableName及Mapper确定，类名不代表表名前缀。删字段须同时收敛前端接口、筛选参数、Mapper、种子及索引。收益是减少分支和数据不一致来源，未测量空间收益。acceptance_status、invitation_version、response_time分别用于邀请应答和版本防并发，保留；独立纪要签到只写minutesId（纪要服务174–178行），仍允许不关联日程。建议验证独立纪要、关联纪要、邀请应答与列表权限；确认旧meeting_id索引由新列索引覆盖所需查询。

### OC08｜P1｜删除逻辑绕成普通更新，部分分支无法写入删除标记

证据：`OaExpenseStandardServiceImpl.java:109–120`、`OaContractTemplateServiceImpl.java:107–118`查实体→setDeleted(1)→updateById；`OaLicenseServiceImpl.java:188–215`、`OaSealServiceImpl.java:198–225`额外统计历史使用次数后，决定上述普通更新或removeById。`BusinessTripServiceImpl.java:123–134`同样将deleted放入更新实体。全局配置`config/cloudflow-common.yaml:72–74`和OA `application.yml:105–107`指定deleted为逻辑删除字段。

| 当前步骤 | 建议步骤 |
| --- | --- |
| 校验→有历史则查count并普通更新deleted；无历史则removeById | 校验→统一使用框架逻辑删除或显式带必要条件的删除更新 |

MyBatis-Plus版本由`cloudflow-backend/pom.xml:39`指定3.5.7。本轮只读检查本机同版本jar的UpdateById和TableInfo字节码：更新SET调用排除逻辑删除列，故setDeleted加updateById不能完成预期删除；removeById在该配置下本来也是逻辑删除。`ExpenseClaimServiceImpl.java:222–228`显式wrapper.set(deleted,1)可作现有实现反证，不能把所有update形式都判错。未连接数据库复现。

保留借出状态限制、租户、版本要求、引用关系与审计。简化后可去除只为区分两种删除路径的history count。建议用相关模块局部删除验证“返回成功后列表消失且记录仍存在”、有历史/无历史及借出拒绝；不要改成物理删除。

### OC09｜P1｜业务写入将缺失租户固定补成100000

证据：`OaExpenseStandardServiceImpl.java:32,80–82,97–103`和`OaContractTemplateServiceImpl.java:81–82,95–101`只在请求tenantId为空时设默认值，更新直接接收请求实体。`common-data/.../MyMetaObjectHandler.java:48–54`只补null，不覆盖已有tenantId；因此不能把后续自动填充当作已验证租户归属的证据。

| 当前字段/步骤 | 建议字段/步骤 |
| --- | --- |
| 请求tenantId或固定100000→insert/update | 入口读取可信租户→强制赋值/限定记录归属→持久化；无合法上下文明确失败 |

固定值兜底与信任输入确认存在，本轮未做越权攻击或运行时复现。属于会改变业务归属的防御性写法，主要风险是正确性而非性能。此处为登录业务操作，不能以全局系统审计可能无租户为理由保留同一默认；系统任务另行显式提供归属。建议验证不同租户、伪造tenantId与缺上下文，保留拦截器及权限检查。

### OC10｜P3｜提交时用当前用户补旧单据身份

证据：`BusinessTripServiceImpl.java:152–164`、`ExpenseClaimServiceImpl.java:249–261`明确注释“历史数据可能缺少用户信息”。当前创建分别80–85行、139–143行已写用户/部门；修改分别101–105行、179–182行保留原申请人字段。

| 当前步骤/字段 | 建议步骤/字段 |
| --- | --- |
| 读取旧单据→所有权检查→逐项用当前用户补userId/userName/deptId/deptName→提交 | 创建时明确申请人身份及允许为空的展示信息→提交校验有效身份并使用单据数据 |

不考虑旧数据后，历史补偿无保留理由。删除前核对系统代办和导入入口，合法无部门或可空名称不能改成必填；管理员操作也不应把自己的部门补为他人申请部门。收益主要可读性。建议验证新建提交、合法可空部门和管理员处理，所有权、状态、锁保留。

### OC11｜P2｜内部工作流启动结果同时支持两键和标量，多处复制解析

生产端`workflow/.../WfInstanceServiceImpl.java:1521–1526`始终构建instanceId、processInstanceId、processNo三字段；`WorkflowInnerController.java:31–41`调用同一启动链。消费例：`CRM/service/impl/CrmApprovalInstanceBinder.java:52–55`先Map/标量，再两键回退；OA/CRM的提交消费者及合同、印章、车辆、访客、知识、报价、续约服务重复extractInstanceId。`ExpenseClaimServiceImpl.java:492–506`还有仅定义、无调用的旧助手。

| 当前响应/步骤 | 建议响应/步骤 |
| --- | --- |
| R<?>→Map或任意标量→processInstanceId或instanceId→String转换→空值处理 | 共享启动结果类型→唯一实例编号字段＋processNo→一次验证并绑定 |

属于内部协议兼容及重复样板，主报告与Workflow同项合并；实际开销以维护为主。保留启动返回失败处理、业务键幂等、重试与绑定校验，不把流程异步成功/失败简化掉。建议验证OA/CRM/HR启动、已有实例重试、无效响应和processNo实际消费方后统一字段。

### OC12｜P2｜会议每个参会人查两遍身份，周期展开继续放大

证据：`OaMeetingBookingService.java:63,197`prepared逐人identities.user；同次非草稿创建73行activate，253行进入`OaMeetingInvitationService.java:31–44`，36行再逐人查；周期保存`OaMeetingSeriesService.java:182`也对每实例activate。

| 当前步骤 | 建议步骤 |
| --- | --- |
| 准备阶段逐人查有效性→事务中逐人再查并取展示名→每个周期实例重复 | 统一身份批量查询→按ID索引校验/组装；事务边界要求重新核验时保留一次批量核验 |

单次普通非草稿创建对N名参会人至少有2N次身份查询（不含其他业务查询）；N为去重并补入组织者后的完整名单（193行）。周期入口准备一次，对每实例activate，重复点位于后者。可先降为每阶段一次批量，是否合并跨事务读取另按并发语义判断。保留同租户、停用状态、邀请版本和房间锁，不能直接复用事务外旧状态。建议验证草稿、正常预约、周期实例和两阶段间用户失效。

### OC13｜P1｜费用标准已存城市和四种周期，提交未传城市且一律按单笔

证据：`DB/04.cloudflow-oa.sql:2678–2695`已有city、limit_amount、limit_type；`OaExpenseStandard.java:30–35`及`FE/services/api/expense.ts:54`定义PER_ITEM/DAILY/MONTHLY/YEARLY；`OaExpenseStandardServiceImpl.java:142–164`只逐明细比较item.amount与limit，limitType只复制到结果，173–205行匹配不区分周期。`ExpenseClaimServiceImpl.java:556–559`把applicantLevel和city均设null后调用validateExceed，提交265行进入这一链路；匹配器182–185行要求非空配置与传入值相等，所以正常提交仅能命中职级/城市均通用的标准。

| 业务字段 | 当前D盘实现 | 已确认业务对应的目标 |
| --- | --- | --- |
| city | 可配置具体城市，但提交固定传null，具体城市标准不命中 | 明确费用适用城市来源，传入真实城市并保留已定义通用规则 |
| limit_type | 四种枚举，计算时均按每笔 | 每笔/每天/每月/每年分别计算 |
| limit_amount | 各标准金额取较小者，周期未参与 | 在对应周期和标准适用范围内比较金额 |

这是功能缺口；不能把city或limit_type当无效兼容列删除，也不能复用桌面旧结论称D盘仍为城市等级数据库。用户已决定具体城市、四种周期均支持；城市取费用发生地、出差目的地还是员工所在地，以及累计采用哪些单据状态、费用发生日还是提交日、并发占额与撤回冲销，仍需形成明确业务口径。建议验证不同城市命中与通用回退、同日多笔、跨月/跨年、撤回和并发提交的局部费用流程。

## 需要业务取舍的项目

### OC14｜P2｜合同模板usage_count无运行时维护，性质待定

`DB/04.cloudflow-oa.sql:2660`存在`oa_contract_template.usage_count`，07种子790行写入；当前OaContractTemplate实体未映射，模板服务只负责列表/保存/更新/渲染，未找到该列运行时计数。它可能是未完成的“被合同引用次数”功能，尚不能认定历史兼容。

| 当前字段 | 候选决策 | 必须区别的同名字段 |
| --- | --- | --- |
| oa_contract_template.usage_count | 不提供次数功能时删除；提供时明确按引用还是渲染统计，并接入真实读写 | oa_knowledge_template.usage_count已有读取排序、使用加一和页面展示，应保留 |

本轮不执行删除。建议以合同模板使用业务确认功能取舍，再核对建表、初始化、展示及计数更新；不要因实体未命中一刀切。

### OC15｜P1｜工单工作日历故障自动改自然分钟，业务结果会变化

`CRM/service/impl/CrmSlaService.java:128–155`在日历计算异常时改用自然分钟，并写审计及告警。当前“工作日历→异常→自然时间→继续保存”可减少报错，但会改变响应/解决期限；目标应明确“暂停计算待重试”或“允许降级且标记待复核”等业务策略，不能作为结果等价的简化直接去catch。保留告警与可追踪状态；建议验证非工作时段、节假日、日历故障及恢复后的截止时间。

## 明确保留和审查限制

`CrmCampaignRevenueService.java:70–96`批量跨服务查询、响应完整性和币种校验服务于准确回款；105–113行逐活动独立事务及收集失败服务于批次隔离。`OaMeetingRules.java:53–74`会议容量、时间窗和配置约束、项目树版本、财务与审批快照、Outbox可靠投递均不能按代码步骤多直接删。会议maxBookingMinutes缺值回退到全局配置尚有当前业务解释，不列为确认冗余。

深入链路包括：CRM工作台/健康计算/字典/部门负责人/SLA/审批绑定/营销收入，OA项目树/预约与周期/邀请/纪要/报销标准/出差与报销提交/证照印章/合同模板/知识模板；对应Mapper、实体、建表、种子与必要前端。未运行编译、测试、服务或数据库；未测量数据库执行计划与延迟；未确认外部直连SQL及第三方消费者。全库字段自动匹配见fields.csv，只能用于定位候选，不作为删列依据。最终实施需逐项写回业务决策、修改文件与局部验证结果。
