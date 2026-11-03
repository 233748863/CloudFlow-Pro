# D盘后端代码质量审计：HR

审计时间：2026-11-02。唯一源码根目录：`D:\CloudFlowPro`。基线：`e0b9e7d27b7690e5eac5f3c02be55b59a52924bf`。本报告独立读取 D 盘源码，不采用桌面副本的结论替代证据；只新增本文档，未修改业务代码、SQL、配置，未构建、测试、连接服务器、重建数据库或提交推送。

结论：确认 12 项可简化或应统一的代码/数据契约问题，另有 1 项仅服务旧验证脚本的兼容入口；数据库单列 3 组判断。优先处理薪资预检、薪资批次权限列表、技能缺口列表、培训档案重复聚合、请假重复逐日计算；工伤四张子表还存在建表与写入字段不一致，重建前必须先统一设计。确认存在冗余不代表可以跳过权限、锁、事务、状态或脱敏要求。

## 范围和证据记法

全模块静态清单覆盖 889 个文件：845 个 Java、43 个 XML（含 POM）、1 个 YML；逐文件行数与摘要见同目录 `backend-quality-audit-20261102-d-inventory.csv`。执行了兼容/历史/异常吞没、反射、转换、SQL 查询调用全模块扫描，再沿下列命中链路深入阅读。静态扫描覆盖文件不等于逐行证明全部 889 个文件中的每个方法正确。

以下路径前缀均对应 D 盘真实路径，行号以该审计基线为准：

| 前缀 | 绝对路径 |
|---|---|
| J | `D:\CloudFlowPro\cloudflow-backend\cloudflow-service-hr\src\main\java\com\cloudflow\hr` |
| M | `D:\CloudFlowPro\cloudflow-backend\cloudflow-service-hr\src\main\resources\mapper` |
| DB | `D:\CloudFlowPro\cloudflow-backend\DB` |
| FE | `D:\CloudFlowPro\cloudflow-frontend\src` |
| COMMON | `D:\CloudFlowPro\cloudflow-backend\cloudflow-common` |
| CHECKS | `D:\CloudFlowPro\scripts\hr-checks` |

P1 = 优先消除批量资源浪费或阻断契约不一致；P2 = 随相关模块整理，主要降低重复读、转换和阅读成本；P3 = 低优先级维护简化。所有 SQL 次数均为静态调用模型，未测量运行耗时、数据库执行计划或节省百分比。

## 已确认问题

### HR-01 / P1：薪资预检为每名员工扫描全租户待处理更正

证据：`J/service/HrPayrollCalculationService.java:178` 的 `preCheck` 在 `189` 查询当前租户全部 PENDING 更正，`191` 对每条更正单独查询工资单，`192` 才比较员工和年份；`J/service/HrPayrollBatchService.java:131` 批次逐员工执行，`135` 调预检，`344` 的预览行构建在 `347` 也调用预检。

| 当前步骤 | 建议步骤 |
|---|---|
| 遍历员工 → 取全租户待更正集合 → 每条查工资单 → Java 比员工/年份 → 得出是否阻断 | 遍历员工 → 数据库按租户、员工、年度、待处理状态作关联存在检查 → 得出是否阻断 |

若 E 名员工、C 条非空 correctionSlipId 的更正，且均未提前阻断，该子检查产生 E 次更正列表读取和 E×C 次工资单读取；C 中属于其他员工的记录同样反复读取。建议首先收敛到每员工一次受条件限制的存在检查，再依据事务与锁边界考虑批次内批量预取。该问题与历史数据兼容无关。

必须保留未完成更正阻断、租户条件、工资年份语义以及最终生成时复核；预览与最终生成发生在不同时间，不能以预览成功代替最终校验。验证只需覆盖同员工同年、更正其他员工/其他年、无更正及预览后新增更正，并比较批次内 SQL 调用数。

### HR-02 / P1：薪资批次列表先取全量，再逐批次逐员工查库判权

证据：`J/service/HrPayrollBatchService.java:240` 查询当前租户所有批次，`243` 逐条 try/catch 筛选；`322` 的 `assertScope` 在 `323` 查批次全部员工，在 `329` 逐人授权；`J/service/HrRuleSupport.java:111` → `115` → `102` 的每次授权都会 `selectById` 员工。详情 `251` 调 `get` 完成一次员工读取授权后，`253` 又查相同批次员工。空批次在 `325` 重读已取过的批次。

| 当前步骤 | 建议步骤 |
|---|---|
| 读全部批次 → 每批读员工集合 → 每员工再读员工档案 → 抛异常/捕获表示不可见 → 详情再次读员工集合 | 在查询中表达完整可见条件，或分组批量读员工与所属部门 → 一次批量判权 → 复用已授权集合 |

B 个非空可见批次、合计 E 个成员时，仅列表授权会额外读取 B 次成员集合和 E 次员工档案；异常被用于普通列表过滤。建议使用“该批次不存在任何越权成员”的条件，不能误改成“存在一个可见成员”。空批次仍按创建者和当前权限规则处理；租户和删除条件必须一致。

`335` 的 `withBatch` 包含锁前定位、锁后重读，确有并发目的，应保留时间边界；可在锁内复用同一次成员集合，不能缓存跨越锁前/锁后。历史兼容：无。验证：全可见、混合可见、全不可见、空批次、受限角色和详情内容，核对授权结果与 SQL 数量。

### HR-03 / P1：技能缺口页按“员工×技能”重复读取主数据与证据

证据：`J/service/HrSkillService.java:319` 分页查员工，`324` 每行调用 `employeeGap`；`505` 内每员工查岗位及岗位要求，`511` 每个要求读取技能定义（`556`）、当前证据（`582`），`488` 的有效性检查又按证据类型查报名/考试/证书，`516` 缺口再查推荐课程。同岗位、同技能的定义在本页重复加载。

| 当前步骤 | 建议步骤 |
|---|---|
| 分页员工 → 每人查岗位/要求 → 每技能查定义/现有等级/证据 → 每个缺口查课程 | 分页员工 → 收集岗位/技能/证据 ID → 按类型批量加载 → 内存按相同规则计算缺口及推荐 |

E 名员工且每人 K 个要求时，除分页查询，存在 2E 次岗位及要求读取、2EK 次技能及当前证据读取，再叠加实际证据和推荐读取；这是条件满足时的调用量，不是实测耗时。历史兼容：无。

证据过期、撤销、来源状态、课程状态和员工权限都是业务必需，必须逐条计算，只需批量取数；不要为省查询直接信任已失效的等级字段。验证同岗位多人、重复技能、撤销证书、缺口为零以及无权限员工，保持推荐内容一致。

### HR-04 / P1：培训档案命中缓存仍完整聚合，未命中同步聚合两次

证据：`J/service/impl/HrTrainingArchiveServiceImpl.java:80` 先在 `82` 调 `buildArchiveRealtime`，之后 `84` 才找持久化汇总；命中在 `85` 用汇总覆盖刚计算的统计值，未命中在 `96` 直接同类调用 `rebuildOne`；`132` 的 `rebuildOne` 在 `137` 再聚合、`138` 再查汇总。`96` 虽有“异步”注释，调用路径无异步入口；只有 `105` 和 `118` 附近的变更回调具有 `@Async`。实时聚合在 `218`、`225`、`232` 查员工/报名/证书，`238`、`249` 查班次和课程，并生成明细和统计。

| 当前步骤 | 建议步骤 |
|---|---|
| 全量读取明细并聚合 → 读汇总 → 命中覆盖聚合值；未命中再全量读取聚合并写汇总 | 明确详情与汇总各自来源；需要实时详情时只算一次，未命中复用本次结果落表；只需汇总时直接读汇总 |

当前缓存命中无法省去完整聚合成本，还可能把新明细与旧统计组合；未命中重复读取和构建相同数据。注释明确提到旧实时聚合回退，属于历史实现叠加。保留统计表还是改为实时统计属于读写一致性设计，不能仅凭此问题删除整表：报名、证书变更回调和 `J/job/TrainingArchiveRebuildJob.java:41` 仍使用该表维护流程。

验证命中、未命中、报名通过、证书作废后的统计与明细一致性，并断言单次未命中只执行一轮聚合；不需要因此扩大成全项目测试。

### HR-05 / P2：通用更新同一记录被两套审计快照重复读取

证据：`J/service/HrTypedCrudService.java:186` 和 `194` 的审计注解在前后调用 `snapshot`，`289` 转 `getAuditRow`，`835` 内 `840` 执行 `selectById`；业务更新在 `360` 读实体、`364` 保存 before、`426` 再读 after 写 HR 审计。公共切面 `COMMON/cloudflow-common-audit/src/main/java/com/cloudflow/common/audit/aop/AuditAspect.java:30` 在调用前求旧值，`34` 执行业务；`COMMON/cloudflow-common-audit/src/main/java/com/cloudflow/common/audit/handle/JaversCompareHandle.java:31` 再求新值。

| 当前步骤 | 建议步骤 |
|---|---|
| 公共审计读旧值 → 业务读旧值 → 更新 → HR 审计读新值 → 公共审计再读新值 | 业务取得受控 before/after → 同一份审计快照交给需要的审计输出 |

经过 Spring 代理的普通更新路径，对同一记录至少四次读取，其中两次来自额外快照；候选人/绩效专用校验可能另有读取，未算入这四次。历史兼容：未见旧数据理由，属于审计实现重叠。不能直接删一套审计记录：二者可能服务不同查询或规则验证；应先统一快照来源。`890` 的内部日志与 `903` 的敏感值处理需要保留，新共享快照不能传播原始薪资、身份证等敏感值。验证两种审计输出仍存在、前后值正确、脱敏相同、失败事务无误报，再核对重复读取减少。

### HR-06 / P2：通用 CRUD 每字段反复构建属性表，并转换已是目标类型的值

证据：`J/service/HrTypedCrudService.java:756` 先把 Map 转目标实体 `patch`；循环 `764` 解析字段、`768` 反射取值、`769` 再反射设值；`790` 每次重新创建字段映射，`801`、`805`、`809` 多处调用；`996` 在拿到 patch 的目标字段值后又 `convertValue`，失败再原值赋值。`715` 与 `974` 同时存在两套近似反射读取方法。

| 当前步骤 | 建议步骤 |
|---|---|
| 转实体 → 每字段重新构建全字段映射 → 猜字段名/遍历列名 → 反射读 → 再转类型 → 反射写/异常后原样写 | 每实体构建一次不可变元数据 → 每次请求按明确字段契约解析 → 使用已正确类型的字段值 |

F 个输入字段、P 个实体字段时，反复建表使该部分工作量包含 F×P 次映射遍历；还增加临时 Map 和反射查找。字段别名猜测含历史兼容倾向，但未证明外部调用完全不用蛇形字段，因此“元数据复用”可先确认，“移除所有别名”必须随调用契约一起收敛。

保留可修改字段白名单、自动字段限制、租户字段保护、泛型和显式置空语义；Java 变量仍使用显式类型。验证正常更新、显式 null、不可改字段、加密字段、集合字段；不允许用无条件 BeanUtils 覆盖全部属性替代。

### HR-07 / P2：薪资套改字段已经齐全仍查询三层，再用反射和吞异常兜底

证据：`J/service/HrTypedCrudService.java:666` 已限定 `hr_employee_comp` 类型，却在 `670`、`701`、`704` 使用反射；`676`、`684`、`691` 先读员工、岗位、薪级，`701` 才检查 gradeId 是否缺失、`704` 才检查 totalSalaryText 是否缺失；`710` 捕获全部异常不记录。`J/domain/dto/HrEmployeeCompPayload.java:25`、`27`、`40` 已有明确类型字段，实体继承此 Payload。

| 当前步骤 | 建议步骤 |
|---|---|
| 反射读员工 → 查员工 → 查岗位 → 查薪级 → 判断两字段是否空 → 反射写，全部异常静默放过 | 明确类型判断缺值 → 已齐直接返回 → 缺值才加载默认依据 → 明确赋值/按业务处理缺配置 |

字段齐全、关联完整时仍固定执行三次查询。默认薪级未配置可以按既有可选套改语义处理；数据库故障、程序类型错误不能与“可选默认值不存在”混成相同结果。历史兼容：未见必要旧数据理由。验证手填两个字段不被覆盖且零套改查询、只缺一项、两项均缺、无薪级配置；不要因清理吞异常强制所有员工必须配置薪级。

### HR-08 / P1：招聘列表逐层补全，重复需求/岗位仍逐行查询

证据：`J/service/HrRecruitmentService.java:52` 候选人分页后映射补全；`124` 的候选人补全在 `134` 查询需求，再经 `110` 的需求补全查询部门和岗位；面试 `146` 在 `157` 再查候选人并递归补全；录用 `164` 在 `175` 同样递归。`J/service/HrViewSupport.java:99` 查部门，`115` 查岗位。

| 当前步骤 | 建议步骤 |
|---|---|
| 查本页 → 每行查候选人/需求 → 每需求查部门/岗位 → 多次复制 Map → 再转输出对象 | 查本页 → 去重关联 ID → 按关联类型批量加载 → 一次组装输出 |

N 个候选人且关联字段完整、部门名尚未提供时，额外产生 N 次需求、N 次部门、N 次岗位查询；面试/录用链路还增加候选人读取。相同需求没有页内共享。历史兼容叠加的字段别名见 HR-09，查询问题本身无需旧数据理由。

必须保留原 `crudService.get` 的权限和敏感字段处理；未经权限过滤的直接跨表连接会改变行为。验证同需求多人、无需求、关联已删除、越权关联、面试与录用显示，并比较一页内查询数。

### HR-09 / P2：招聘旧字段别名在前后端重复双向补齐

证据：`J/service/HrRecruitmentService.java:115`、`116`、`117`、`129`、`169`；`J/domain/vo/recruitment/HrRecruitmentRequisitionVO.java:18` 同时保留 requisitionNo/requestNo，`31` 同时保留 expectedArrivalDate/expectedDate，`34` 同时保留 requirements/jobRequirements；旧名注释明确为兼容前端。`FE/services/api/hr/recruitment.ts:19`、`30`、`49` 读取双向补齐，`58`、`66`、`77` 写回又转名；页面 `FE/pages/hr/HrRecruitmentPage.tsx:126`、`133`、`323` 等仍使用旧名。

| 字段语义 | 当前同时支持 | 建议唯一契约 |
|---|---|---|
| 招聘需求编号 | requisitionNo / requestNo | requisitionNo |
| 候选人关联需求 | requisitionId / requestId | requisitionId |
| 需求到岗日期 | expectedArrivalDate / expectedDate | expectedArrivalDate |
| 岗位要求 | requirements / jobRequirements | requirements |

当前步骤为后端补别名→前端再次补→页面使用不同名字→保存再还原；建议前后端一次统一字段，页面直接读写正式名称。录用日期需遵循录用对象自己的正式字段，不能仅按同名把需求和录用日期混并。资源主要为额外 Map/对象属性、转换与阅读成本，无耗时测量。历史兼容：确认是契约兼容，但这些别名不能直接算作数据库重复列。测试数据重建允许同步删除旧入口；验证需求/候选人/录用各自创建、编辑、列表与详情即可。

### HR-10 / P1：简历解析技能字段在后端为数组，人工修订页面按字符串处理

证据：`J/service/impl/HrResumeParserServiceImpl.java:91`、`296` 输出 ArrayNode；`J/domain/dto/HrResumeParsedFieldsPayload.java:34` 用 JsonNode 接收，`updateParsed` 在 `220` 后直接保存提交字段，没有限制为数组。`FE/services/api/hr/batch2.ts:18`、`36` 将 parsedSkills 声明为 string；`FE/pages/hr/components/HrResumeParsePanel.tsx:98` 直接填编辑状态，`314`/`315` 使用 textarea 字符串输入，`215`、`367` 直接渲染。

| 当前链路 | 建议链路 |
|---|---|
| 自动解析写 JSON 数组 → UI 当字符串编辑 → 修订可写 JSON 字符串 → 后续消费者面对两种形状 | 后端和前端确定一种技能结构 → UI 仅在展示/编辑边界做明确转换 → 服务端校验同一种结构 |

这是正在生成不统一数据的契约缺口，不能通过增加“数组/字符串都猜一遍”的兜底继续积累。建议技能保持数组并以明确分隔或列表控件编辑；经历字段单独确认结构，不把技能结构强加给经历。历史数据无需迁移，但自动解析与人工编辑都必须从同一入口规则产出。验证自动解析、人工增删技能、空列表、确认后读取；本轮未运行浏览器，未把显示异常写为已复现。

### HR-11 / P2：招聘联系方式明确保留无国家码旧数据兜底

证据：`J/service/HrRecruitmentIdentityService.java:45` 的 `prepareCandidate` 捕获电话规范化失败，在电话与旧值相同的情况下放行；`66` 的 `candidateContacts` 再规范化，在 `70` 捕获 `legacyWithoutCountry` 后把电话置 null，随后仅以剩余联系方式占位。

| 当前步骤 | 建议步骤 |
|---|---|
| 规范化电话失败 → 比较旧值 → 原样保留 → 占位时再规范化 → 失败当成无电话 | 写入入口按统一规则校验电话 → 占位使用已验证联系方式 |

历史兼容：由异常变量名和保留未改旧值分支直接确认；在全量重建前提下不需继续容忍旧电话格式。收益主要是规则可读性和避免同一值在不同阶段被当成“有电话/无电话”。仍须接受业务允许的空电话、校验实际输入格式，并保留租户、权限、联系人唯一占位、事务和锁；`59` 的历史联系方式占位用于同一候选人改联系方式后的身份去重，具有独立业务作用，不能因名称 History 一并删除。验证合法电话、空电话、非法电话、只改姓名、同联系方式重复提交以及更新联系方式后的身份归属。

### HR-12 / P1：一次请假提交重复逐日算时长，再逐日查相同班次/日历

证据：`J/service/HrLeaveBusinessService.java:123` 进入同一考勤配置与员工假期锁后，`130` 调 `calculateAndValidate`，`132` 又调 `periodQuantities`；前者 `1226` 遍历日期并调用 `singleDayQuantity`，后者 `1246` 再遍历相同日期并调用同一个计算；`J/service/HrLeaveDayCalculator.java:29` 每次加载班次，`94`/`95` 查分配班次、`97` 查班次内容，`41` 再解析日历。

| 当前步骤 | 建议步骤 |
|---|---|
| 第一次逐日查班次/日历并算总时长 → 第二次逐日查班次/日历并算周期分配 → 分摊舍入差额 | 单次获取逐日计算结果 → 汇总总时长并校验 → 用相同逐日结果分周期并分摊舍入差额 |

D 个被遍历日期会调用日计算 2D 次；存在班次时重复加载班次，日历内部是否命中缓存取决于运行状态，本报告不假定全部访问数据库。历史兼容：无，属于重复派生计算。保留从开始日前一天纳入跨夜班次、假期单位、节假日规则、周期边界和最后一周期的舍入差额处理；不能简单平均分摊。已有月考勤重算使用批量日历与班次，可复用该种取数能力但不要改动其语义。验证跨夜、跨周期、小时/天、节假日和舍入，总扣减必须等于服务端核定总时长。

## 低优先级兼容入口

HR-13 / P3：`J/service/HrSettlementCalculation.java:113` 和 `144` 保留不带 reviewed selection 的旧重载，`241` 注释明确“Compatibility for the original standalone checks”，`242`–`248` 为其额外推导固定月份选样。生产 `J/service/HrSettlementCompensationSource.java:29`、`50` 都明确传核定 selection；仍在使用旧重载的是 `CHECKS/HrSettlementCalculationChecks.java:59`、`118`、`189`。当前为“旧检查调用 → 生产兼容推导 → 新计算”，建议“检查显式构造核定 selection → 新计算”，同步更新旧检查即可移除兼容重载。不要将其描述为真实请求性能收益，收益是少维护一种选样语义。核定月份、原因、分母及冻结依据都应保留；仅重跑直接相关离职计算检查。

## 数据库字段：分别判断，禁止批量按关键词删除

### HR-D1 / P1：四个工伤子表 employee_id 与当前写入不一致

证据：`DB/03.cloudflow-hr.sql:1740`、`1762`、`1787`、`1809` 在 investigation/treatment/compensation/rehabilitation 四表均定义必填 employee_id，无默认值；`1740` 注释是“冗余便于数据权限”。四个 Payload 只有 injuryId，不包含 employeeId，例如 `J/domain/dto/HrWorkInjuryInvestigationPayload.java:21`；四创建实现分别 `J/service/impl/HrWorkInjuryInvestigationServiceImpl.java:40`、`HrWorkInjuryTreatmentServiceImpl.java:40`、`HrWorkInjuryCompensationServiceImpl.java:43`、`HrWorkInjuryRehabilitationServiceImpl.java:40` 均只设置 injuryId 后插入。主表员工在 `DB/03.cloudflow-hr.sql:1710`。演示 SQL `DB/06.cloudflow-business-seed.sql:12519`、`12523`、`12531`、`12535` 却会直接填子表 employee_id。

| 关系/字段 | 当前结构及操作 | 建议目标 |
|---|---|---|
| 主表 employee_id | 已表达该工伤属于哪位员工 | 保留，作为真实归属 |
| 子表 injury_id | 写入并用于按案件查询 | 保留并核对案件租户/访问权限 |
| 四子表 employee_id | DDL 必填，Java 不写；另有四组员工索引 | 倾向删除重复列及相应索引，统一从关联案件取员工；删除前明确子表数据权限实现 |

确认的是静态建表/写入契约冲突；在严格 SQL 模式按本 DDL 新建时，此插入路径存在必填列缺失风险，本轮未连接数据库实测。不能用“给 0 默认值”或“缺值再猜员工”兜底。若业务要求独立按员工检索子记录，也可采用受约束的关联查询；如果决定保留冗余列，必须始终从已授权的主案件派生，不能让前端自由填写。

审阅当前 `HrTypedCrudService.java:610` 的通用权限逻辑主要依据 deptId/userId/createBy，不能声称这四个未映射 employee_id 已在正确实施权限。验证重建后四类新增、查询、案件关联及跨员工/租户拒绝；变更属于数据关系与权限联合处理，不是机械删列。

### HR-D2 / P2：绩效评分 response 三列与邀请记录重复，当前聚合并未利用

证据：`DB/03.cloudflow-hr.sql:1957`–`1959` 的 objective_id/evaluatee_id/evaluator_source 注释明确是冗余；`J/service/impl/HrPerformance360ServiceImpl.java:188`–`190` 从已找到的评估邀请复制写入。`M/HrPerfEvaluatorMapper.xml:112`–`121` 聚合从邀请 e 取 source/weight/objective/evaluatee，response 仅按 evaluator_id 与 tenant_id 联接并提供 score；`M/HrAppraisalCycleMapper.xml:63` 新周期也按 invitation.id 联接。`J/domain/entity/HrPerfEvaluatorResponse.java:26`–`29` 仍映射四个字段。

| 字段 | 当前 | 建议 |
|---|---|---|
| response.evaluator_id | 关联 hr_perf_evaluator.id，已有唯一约束 | 保留作为唯一归属 |
| response.objective_id | 从邀请复制，当前关联/聚合取邀请值 | 候选删除，查询取邀请 |
| response.evaluatee_id | 同上 | 候选删除，查询取邀请 |
| response.evaluator_source | 同上 | 候选删除，查询取邀请 |
| idx_hr_perf_response_obj | 为重复列建立的索引 | 与字段决策同步处理 |

确认三列存在重复写入且当前已审查询不依赖其值；没有发现代码将它们当成“提交时不可变快照”读取。建议重建版本收敛为邀请关系一个来源，但应先核实是否有仓库外报表/导出直接依赖，以及邀请修改规则是否需要提交时快照；若需要快照，应明确快照语义并实际使用，不能两份值任意取。演示种子同样需要同步（`DB/07.cloudflow-demo-seed.sql:656`），不需要旧数据迁移。验证提交、汇总、周期评分和演示种子导入。

### HR-D3 / P2 / 待业务取舍：数据库未接入字段不等于全是兼容字段

| 表.字段 | 已核对的现状 | 判断和改造边界 |
|---|---|---|
| hr_mall_item.sort_order | `03.cloudflow-hr.sql:1641` 定义且索引包含；HrMallItemPayload/DTO 未暴露，`HrMallItemServiceImpl.java:72` 走通用分页；通用排序 `HrTypedCrudService.java:644` 优先 updateTime | 未接入排序能力，不能仅因没映射就认为历史兼容；需确定商城是否需运营排序。不要误以为保留列就已支持排序 |
| hr_mall_order.item_count | SQL `1660`，当前订单 Payload 无该值；创建明细 `HrMallOrderServiceImpl.java:106`–`117` 写 quantity | 可由明细求和的汇总候选，需决定是否有订单列表件数需求；避免再加回填兜底 |
| hr_mall_order.express_company | SQL `1664`；发货 `HrMallOrderServiceImpl.java:185` 只收 expressNo | 独立快递公司语义，属于未接入字段，不能等同单号的重复别名 |
| hr_mall_order.cancel_reason | SQL `1668`；取消 `HrMallOrderServiceImpl.java:212` 写 remark，覆盖下单备注 | 确认存储目标不统一；取消原因与下单备注有独立用途，倾向分别保存并让页面读取，不能直接删 cancel_reason 后继续覆盖备注 |
| hr_mall_order_item.item_no / cover_image | SQL `1690`、`1692` 注释为下单快照；当前明细 Payload `17`–`23` 无此二列，创建只写名称、价格等 | 若需要历史订单显示下单时编号/图片，应补写快照；否则删除闲置列。已实现 item_name/point_price 的快照必须保留，商品改价不应改历史订单 |
| hr_work_injury.dept_id / closed_at | SQL `1711`、`1722` 有语义；`HrWorkInjuryPayload.java:19` 起未映射；close `HrWorkInjuryServiceImpl.java:175` 更新状态/原因但不写 closed_at | 事发部门可不同于员工现在部门，结案时间不同于最后更新时间；更像未落地历史事实，不可机械删除 |
| hr_dispute_evidence.file_name / file_url | SQL `1907`/`1908`，当前 Payload `HrDisputeEvidencePayload.java:20` 只存 fileId；attachEvidence `HrLaborDisputeServiceImpl.java:159` 依 DTO 转实体；页面 `HrLaborDisputePage.tsx:396` 只使用 fileId/受权下载入口 | 倾向统一 fileId 及受权下载，不持久化易失效 URL；若需证据提交时文件名，必须明确为快照并真正填入。需同步演示数据，禁止以旧 URL 绕过附件授权 |

这些列当前是否在外部报表或运营流程使用，本次仓库审计无法证明；保留为有明确证据的设计决策项，不列作“已确认全部可删”。

## 必须保留的边界与反证

- 招聘 `source` 与 `channel_id` 保留：用户已确认允许独立填写来源、渠道可空；`DB/03.cloudflow-hr.sql:317` 虽将 source 注释为兼容历史，`J/domain/dto/HrCandidatePayload.java:28`/`29` 和页面 `FE/pages/hr/HrRecruitmentPage.tsx:1277`/`1295` 当前均有独立字段，渠道统计亦依赖 channel_id。不得依据 SQL 注释删除 source。
- 薪资/离职的已核定政策、工资项、税额、取样月份、实际支付流水和审批快照有冻结事实用途；`HrEmployeeCompPayload.java:31`/`34` 和 `39`/`42` 的 Text/业务属性是一列数据库值与一个 `exist=false` 内存表示，不能统计为数据库重复列。
- `J/service/HrAppraisalGuard.java:87`–`120` 的 legacy 分支用于阻止旧绩效入口修改冻结周期，不可只因“旧”就删除隔离；`70` 先锁周期再读实体有并发目的。业务是否停用旧绩效模式需要另作决定。
- `J/service/HrHCipherService.java:61` 的 legacyAmount 仍由 `J/service/HrOvertimeSettlementService.java:133` 写当前加班薪资变更，不能只删解码/加密兼容而留下生产写入方。可后续统一密文契约，但需全链路处理。
- `J/service/impl/HrResumeParserServiceImpl.java:237` 先定位解析所属候选人、校验权限、加候选人锁，再读解析行；锁后重读针对并发变化，不能全部合并成锁前读取。招聘身份占位及确认录用的事务/去重同理。
- `J/service/HrAttendanceBusinessService.java:273` 已按员工月份批量取日历、班次和打卡（`280`、`288`、`297`），不能沿用其他副本的旧结论声称这里仍逐日重载整月。月底封账和手工调整保护有业务意义。
- 异步外部审批启动响应校验及持久化事件投递失败处理属于真实失败边界；例如 `HrLaborDisputeServiceImpl.java:222` 检查工作流结果，`235` 写业务事件。不能把所有 fallback/catch 一律视为历史数据兼容。

## 深入核查文件与未覆盖限制

深入阅读的主要链路包括：HrTypedCrudService、HrViewSupport、HrRuleSupport、HrHSupport；HrPayrollCalculationService、HrPayrollBatchService 及借款/薪资调用边界；HrRecruitmentService、HrRecruitmentIdentityService、HrRecruitmentContacts、HrResumeParserServiceImpl、对应招聘 VO/Payload 和前端；HrTrainingArchiveServiceImpl 及报名/证书刷新调用、TrainingArchiveRebuildJob；HrSkillService 的缺口、有效证据及定义读取；HrLeaveBusinessService 的提交/时长/跨周期分配、HrLeaveDayCalculator、HrAttendanceBusinessService 月重算；HrSettlementCalculation、HrSettlementCompensationSource 和直接验证脚本；HrAppraisalGuard、HrPerformance360ServiceImpl、HrPerfEvaluatorMapper/HrAppraisalCycleMapper；四个工伤子表创建、商城订单/商品、争议证据及对应 Payload、DDL、种子声明。公共 AuditAspect/JaversCompareHandle 仅为验证 HR 双审计调用读取，不替代平台报告。

本轮未执行编译、运行测试、浏览器验证、SQL 执行计划、并发压测或服务器数据库核对；没有声称性能比例、线上故障已复现、全部方法逐行审阅或仓库外消费者不存在。其余未深读链路仅有清单和静态扫描，不据此判定“无问题”。所有事项均为待实施，后续应逐项记录改动与直接相关验证；当前文档不代表已改造。
