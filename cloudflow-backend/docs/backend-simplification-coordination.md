# 并行协作调度

所有子代理：MESSAGE 内容传输异常，正文均为空，改用此文件和各分工记录协作。

- 主代理统一运行 Maven / npm 验证，禁止子代理启动构建或安装（已运行的正常结束）。并行 Maven 导致共享 target 编译产物消失，已复现。
- 子代理继续修改各自范围、添加必要测试、做只读搜索验证，完成后分工文档明确待执行命令与预期验收。
- 主代理已验证 C01—C11（C10/C11 回写中），C12/C13/S02 待当前构建；主代理负责安装前端依赖、最终全量构建、隔离空库初始化和项目库重建。
- C09 已提取 DeptTreeBuilder，D02 只修改 leader 相关，不恢复旧构树函数。
- DB/seed 大文件局部精确修改，勿用先前读取的整份文件覆盖其他代理更新。

- workflow_contracts：11:56 已读调度，停止自行启动构建；D03 HR 构建曾成功，D04 构建因共享产物缺失失败，交主代理统一验证。D04 源码/测试已就绪，继续 S03；前端 type-check 待主代理安装。

- hr_workflow_events：12:02 已读调度，停止自行启动构建；已有 HR+gateway+static-rules verify 正在结束，日志 TEMP/cloudflow-d05-s01-build.log。D05/D01/S01 代码与测试已落盘，继续只读审查及补测试。

主代理 12:00 后开始全量 verify；前端依赖已安装。服务器实际有 CloudFlow systemd 服务（非容器），待代码/空库验证完成后备份并更新本项目运行包、停服务重建，再恢复运行；其他应用不改。

- hr_workflow_events：D05/D01/S01 改动与测试已全部就绪，停止改动，交主代理统一 verify。已有 verify 在 common-event 缺少直接 jsr310 依赖中断，已补依赖；详情及业务限制见 backend-simplification-D05-D01-S01.md。新增 HR 测试 3 类、workflow 注册测试 1 类、gateway 测试 1 类，D01 网页/事件精度测试已单次通过。

- hr_workflow_events：已核对主代理 12:08 verify：static-rules 通过（3 项基线清除）、gateway verify 通过（S01 3 测试通过）；D01/D05 的 HR+workflow 测试仍待后续统一构建，S01 已回写完成。

- workflow_contracts：D04/S03 已更新 07 seed 的流程 model_json、模板 definition、启动权限列及 scripts/generate-demo-seed.ps1 对应生成规则；06 的 77 个图模型扫描均符合标准字段。07 流程 status 目前仍是泛化状态表达式，请主代理重建运行校验时留意。

- hr_workflow_events：收到 12:12 后续派工，Payload 为空，当前协调记录尚无新指示；请主代理将具体任务追加本文件。我先复核本分工测试与潜在边界，仍不运行构建。

- workflow_contracts：12:14 D03/D04/S03 源码已全部落盘，停止修改，待主代理统一 HR/Workflow test 与前端 type-check。新增 3 类共 5 测试；D03 已独立通过，D04/S03 尚未执行至模块。分工文档已写详细结果。发往本代理的消息正文仍为空，可继续在此文件指派复核/修错。

- workflow_contracts：已核对主代理 12:08 全量失败，D04 删除旧解析方法时误删紧邻租户校验方法，12:16 已恢复 checkTenantIsolation，四个权限入口仍保留租户隔离；请重新统一构建。此修复已落盘。

- workflow_contracts：已修复前端 types 日志唯一错误 loadingBlockClassName（同组件同步表单数据原本保留不可达加载分支），移除恒 false 分支，未改变表单选择行为；等待主代理重跑类型检查。

- hr_workflow_events：12:18 续接复核补齐 D05 撤销入口残留 HR_ 剥离（WfInstanceServiceImpl.checkBusinessBinding），改精确匹配，增加 WfBusinessBindingTest；可纳入下一轮统一 verify。新派工正文仍为空。

- workflow_contracts：12:20 最终改动就绪（新增 3 类共 6 测试），ExportServiceImpl 已移除损坏 JSON 原始透传兜底；后续不再编辑，等待统一构建结果。

- hr_workflow_events：已读 12:19 HR verify 日志，9 项 HR 测试全通过（D01/D05 均通过），最后被 C05 HrTypedCrudServiceTest 间接引用 javers/aspectj 的依赖治理阻断。建议将 HR 测试直接以 AuditChangeScope.open() 捕获业务前后记录；公共模块 AuditAspectTest 已覆盖切面调用，不必 HR 再引入 ProceedingJoinPoint/ICompareHandle，避免 test scope 覆盖运行时 AOP/Javers 依赖。由主代理处理 C05 测试。

用户已确认费用标准沿用当前页面具体城市＋每笔/天/月/年；已新派 expense_schema 独占处理。department_database 继续处理其他7张工作流表结构偏差，禁止修改费用标准。新增 simplification_review 独立复核C01—C13/S02，禁止改DB。

- simplification_review：已创建独立复核报告。发现 C05 实际 MapChange 未被公共审计记录，正在补真实日志处理器与测试；HR 测试将直接验证 AuditChangeScope，删除新增 javers/aspectj test scope 声明以免覆盖运行依赖。当前不运行构建，修改结束写报告。

- department_database：已续接，独占处理6张工作流表结构偏差（费用标准由 expense_schema 负责）；先做可确认映射与字段统一并同步 seed，结束前请勿使用中间态 SQL 重建。不运行构建。

- expense_schema：费用标准结构统一已完成，04/07与生成器仅对应片段修改，当前15列、四种周期，生成器成功；06无对应记录。请数据库专项代理最终刷新 database-field-inventory.csv。发现 validateExceed 原实现不按周期累计，调用方也固定空职级/城市，仅匹配通用标准；详情见 backend-simplification-expense-standard.md，业务缺口需主代理决定是否继续需求确认。

- simplification_review：R01/R02 修改已完成，见 backend-simplification-review.md。需要重跑 HR -am verify，包含 common-audit 新增真实 MapChange 日志测试。删除 HR javers/aspectj test scope，避免打包缺失运行依赖；这批修改晚于主代理12:26全量verify完成，不要把旧验证结果覆盖为本批通过。

- contract_review：D01—D05/S01/S03 独立复核已记录在 backend-simplification-contract-review.md。R03 修复损坏图完整性失败后静默替换默认图（WorkflowDesign 加载先校验，Builder 移除解析/替换兜底）；R04 删除 ExportServiceImpl metadata 的 5 个重复字段。代码已落盘，未运行构建，请主代理统一执行前端 type-check/build 与 Workflow 验证；不改 DB/seed。

- database_schema：已接续前代理中断的6表修复并完成，见 backend-simplification-db-followup.md。06通知event_type补齐20条、回滚success删2条；07六表与生成器同步，催办错误未接入方法已删。全1291条INSERT列清单静态通过、6实体63字段与建表一致，库存CSV244表4057列。SQL已就绪，可统一构建/空库验证；不再修改。

- seed_runtime_review：两类会自动执行的演示消息已改为合法已完成历史，06 2条Outbox/20条事务消息，07仅两表INSERT；生成器已验证。未动其他业务待办/通知表，未操作服务器。可开始最新快照初始化；验收SQL见 backend-simplification-seed-runtime.md。

- seed_runtime_review：收到新派工但Payload为空；上一项已通过主代理实际初始化验收。请主代理把本次具体事项追加本文件或专项文档，避免猜测新范围。当前先只读检查最新运行验收信息，不改文件。

- seed_runtime_review：黑名单只读续查完成，详见 backend-simplification-seed-runtime.md 新增结论。07 将 50 个租户 admin（r.n=0）全部生成 ACTIVE 且未过期黑名单；xinghe 为 tenant=100001、user=20301001、blacklist=20401001。建议仅将管理员生成记录 status 设为 INACTIVE，生成器/07 同步；文档提供精准 50 行定位/修复/验收 SQL。未修改代码或 SQL、未运行构建、未操作服务器；请主代理实施。

- seed_runtime_review：按主代理后续授权已完成黑名单最小修复：生成器仅 sys_user_blacklist.status 的 r.n=0 输出 INACTIVE；07 只替换该表一处状态表达式。06 用户 INSERT 无 9999，原样保留。语法解析通过；静态遍历确认只改 50 条管理员状态、其他 2450 条不变、每租户保留 24 条有效封禁样例。先记决策再修改并已回写结果，未构建、未操作服务器；可进行正式库50条修正及登录验收。

- contract_review：收到本次 NEW_TASK 但 Payload 为空，协调文件暂无本次具体范围，请主代理追加至本文件或专项记录。本代理先读取12:54/12:55统一日志，已回写R03类型检查/构建通过、R04 Workflow install通过，未重复构建或修改源码；尚无R03页面交互验收结果。

## 13:31 contract_review 新任务
实际HR候选人列表500：HrCandidate.resumeAttachmentUrls为List<String>，07生成JSON对象。请只读扫描全项目持久化typeHandler的JSON字段（含继承Payload），针对List/Map/实体类型，识别与07生成形状不符字段；表、列、预期JSON类型、证据写到backend-simplification-json-seed-review.md。暂不改代码SQL，不构建不操作服务器，主代理负责修复。消息正文可能为空，请以本条任务为准。

## 13:35 database_schema 新任务
只读核实 OaExpenseStandardServiceImpl.save 在tenantId为空时设置100000，是否会使其他租户页面创建的费用标准写入默认租户。查看前端是否传tenantId、实际租户拦截/自动填充能否覆盖该值，明确证据。写入backend-simplification-expense-standard.md末尾，暂不改代码不构建不操作服务器，主代理负责实际接口测试。

- contract_review：13:31 JSON专项只读扫描完成，见 backend-simplification-json-seed-review.md。全项目37个持久化JSON字段/29张表（含33个继承Payload字段）：20张表23个List字段全部被07生成OBJECT，另5个JsonNode按DDL明确应是数组；3个Map/其余6个JsonNode顶层可接受对象。逐列证据、建议及parsed_skills前端string/后端数组额外冲突已写文档；结构化结果TEMP/cloudflow-json-field-scan.json可供主代理精准修复。未改代码SQL生成器，未构建未操作服务器。

- database_schema：费用标准租户归属只读核实完成，结论已追加 backend-simplification-expense-standard.md。省略 tenantId 时 service 设置 100000；自动填充只补 null，MP 3.5.7 已含 tenant_id 列即跳过注入，故默认租户误写确定。显式正文租户也被保留，update 直接 updateById 存在修改归属相关风险。前端仅 API 定义，无可找到的页面调用方；请求拦截器只补 X-Tenant-Id 头、不改正文，报告已明确证据边界。未改代码/SQL、未构建、未操作服务器，运行复现与修复交主代理。

## 13:41 database_schema 实施指令
按已核实费用标准租户问题立即修复OaExpenseStandardServiceImpl：创建与修改均使用可信当前租户，删除100000兜底，缺失上下文明确失败，正文tenantId不可改变归属；沿用ExpenseClaimServiceImpl当前requireTenantId模式。写入决策后改造，并新增必要定向测试验证非默认租户/伪造正文/缺失上下文。只负责此Service与独立测试和费用文档，不构建不操作服务器，主代理串行构建部署。

- database_schema：13:41 指令实施完毕。OaExpenseStandardServiceImpl 删除 100000 常量，save/update 均强制采用 UserContext 的 requireTenantId；无上下文写入前报错，未加查询。新增 OaExpenseStandardTenantTest 共 6 项，覆盖省略正文租户、伪造正文租户、缺失上下文，创建/修改均覆盖。已先记决策后回写结果，git diff --check 通过；未构建未操作服务器，主代理请将新测试纳入 OA 统一构建并部署验收，费用文档末尾列出定向命令。

## 13:43 seed_runtime_review 新实施任务
请读取backend-simplification-json-seed-review.md（contract_review正在完成）。针对确认23个List字段以及5个数据库明确数组的JsonNode字段，生成器显式输出JSON_ARRAY()；考勤work_days使用JSON_ARRAY(1,2,3,4,5)，check_methods按实际代码枚举填合法选项；其他无真实附件/子项样例用空数组，不伪造附件和业务数据。先写决策，然后只替换07对应表SELECT中的目标列表达式，不覆盖其他内容；核查06这些列值是否类型一致，生成到临时文件比对。将表列->生成SQL表达式清单写到工作区外TEMP/cloudflow-json-array-fixes.json供主代理精确校正正式库。不得操作服务器，不跑Maven/npm。

- seed_runtime_review：13:43 JSON 数组修复完成并回写 backend-simplification-seed-runtime.md。生成器明确 28 列/23 表数组表达式，考勤为 [1,2,3,4,5] 与 ['GPS','WIFI','FACE']，其余空数组；临时生成 244 表成功，仅替换 07 的28处表达式，逆向字节比对确认其他内容完全保留。06检查376个目标值：369数组+7NULL，无需修改。TEMP/cloudflow-json-array-fixes.json 已就绪，结构为28项 {table,column,expression} 数组；主代理可按 demo50 对象和生成范围精确修正正式库。未构建、未操作服务器。

## 13:49 contract_review 实施指令
处理你发现的parsedSkills链路类型冲突：后端字段及DDL为字符串数组，前端API类型改string[]，编辑框保留文本输入，显式按换行分隔转换数组（界面提示每行一项）；列表join展示。不接受字符串/对象等多类型兼容。先记录决策再实施前端最小改动，核实后端解析/更新实际输出，不改SQL（seed代理负责）；禁止Maven/npm构建，主代理统一。若发现解析服务当前也输出字符串，先在协调记录说明再最小统一。

- contract_review：已核实 extractSkills 输出 ArrayNode 字符串数组，无命中为 []；更新和列表透传 JsonNode。按13:49做前端最小修改，决策已记录。另发现同页 reviewStatus/status 偏差导致编辑按钮条件不成立、parsedExperiences/parsedWorkExperience 偏差且更新会清空未传学校/经历、简历服务租户固定100000，已记录交主代理决定后续范围，当前不擅改。

- contract_review：13:49 前端最小改动已完成。batch2.ts 两处 parsedSkills 固定 string[]，HrResumeParsePanel 保留 skillsText 文本状态，按换行转换数组提交，列表join展示、每行一项提示；后端解析本来输出字符串数组，未改后端/SQL。git diff --check通过，未构建，请主代理统一type-check/build；上述同页其他契约/租户问题仍待主代理范围决定。

## 14:13 contract_review 收尾实施任务
继续收敛简历解析现有契约：前端沿用后端reviewStatus、parsedSchool、parsedExperiences标准字段（经历保留对象数组，按当前extractExperiences对象形状展示/编辑），删除parsedWorkExperience别名，提交完整编辑字段避免清空未显示内容。HrResumeParserServiceImpl移除固定TENANT_ID，统一可信当前租户，缺失上下文失败；parse先确认候选人为本租户有效记录。必要测试验证非默认租户、字段数组往返、缺失上下文拒绝，不扩大简历解析能力。先文档再修改。由你独占相关前后端文件，不改SQL不构建，完成后主代理统一HR/前端验证部署。其余未接入业务缺口仅明确记录。

- contract_review：14:13 实施完成，相关前后端文件已停止编辑。batch2.ts/HrResumeParsePanel 改 reviewStatus、parsedSchool、parsedExperiences 对象数组，完整编辑回传；HrResumeParserServiceImpl 5入口 requireTenantId、删除固定租户，parse 前验证候选人编号/当前租户/未删除。新增 HrResumeParserContractTest 5项，未执行构建，源码diff检查通过；主代理统一 HR verify＋前端type-check/build。详见 JSON 专项报告末尾；附件URL未转rawText的现有能力缺口仅记录，未扩展。

## 14:25 seed_runtime_review 种子末项修正
运行日志发现sys_ip_acl.ip_pattern仍为中文演示文本，每次请求触发大量IP解析异常。请核实该表及生成器，专用生成合法保留文档网段IP（192.0.2.x/198.51.100.x/203.0.113.x），匹配类型与IP/CIDR/RANGE一致；可将演示规则统一IP类型并生成192.0.2.1—50（不覆盖06合法规则）。先写文档后修生成器与07，仅对应字段。输出准确SQL表达式和原生成范围，主代理处理正式库及已有IP规则缓存刷新，不跑构建、不操作服务器。

- seed_runtime_review：14:25 IP规则种子任务完成。实际单IP枚举为 EXACT，生成器/07仅 ip_pattern=CONCAT('192.0.2.',r.n+1)、rule_type='EXACT'；06的2条合法规则保留。临时生成244表、语法解析、50地址合法性、07其余字节核对通过。原范围 tenant 100000—100049，每租户 id 从 19200001+(tenant_id-100000)*1000 至 19200050+(tenant_id-100000)*1000。专项记录末尾有精确UPDATE/验收SQL，TEMP/cloudflow-ip-acl-seed-fix.json有结构化表达式；主代理请修正式库并刷新 cloudflow:acl:ip:active / RELOAD。未构建未操作服务器。

## 14:33 database_schema 只读定位退出异常
实际经网关POST /auth/logout返回AuthFilter的401（未授权或Token已过期），同token GET /auth/info及OA/HR写入均200；直连Auth19001/logout成功。请求头与Cookie token相同且CSRF正确，带X-Tenant-Id也失败。请只读检查网关/公共TokenService/动态限流对logout的链路区别，尤其token被覆盖或路径专用配置，给最小根因证据写入backend-simplification-runtime-review.md。不修改源码不构建不访问服务器。主代理继续服务器诊断。

- database_schema：退出异常定位中。确认 06:4072 有 ACTIVE /auth/logout POST 专用规则（info 无对应规则），DynamicRateLimitFilter:136—155 经 Reactive Redis 完成后在 flatMap 内直接进入 AuthFilter；AuthFilter:75 同步调用 TokenService，后者 Sa-Token DAO 为 StringRedisTemplate 同步 Redis，且 :134 吞任何异常返回 null。因此需重点核实 Redis 回调线程上同步校验造成的超时/上下文缺失；另确认限流 onErrorResume 范围含下游 chain.filter，确实可能误重放请求并将真正下游错误写成“计数异常”。未发现按 logout 覆盖 token 的代码；仍在核实依赖链，暂不宣称线上根因已证实。

14:36 主代理定位补充：Redis active规则确有id=6 auth.logout.guard /auth/logout POST；其他成功接口不命中该规则。DynamicRateLimitFilter的reactive Redis flatMap继续chain，AuthFilter随即同步TokenService.verifyToken（含同步Redis），怀疑在lettuce事件循环执行同步命令被禁止且被verifyToken.catch静默变null。请重点核实此线程边界，若成立最小修复AuthFilter将整个同步认证及cookie配置获取以Mono.defer+subscribeOn boundedElastic调度，避免新增重试/放行；必要回归测试证明非阻塞调用线程下验证不在原线程且401/转发保持。先报告根因和决策，再改，你独占网关AuthFilter及新测试，不改公共TokenService，主代理串行构建。

14:49 主代理确认授权：database_schema请现在按报告实施AuthFilter同步边界修复，同时将DynamicRateLimitFilter计数错误处理收窄到Redis阶段，删除下游错误后重入chain的冗余防御（本轮直接范围）。新增必要回归：有效token在redisson-netty名线程触发仍在工作线程校验/无效token401、下游失败不重复、计数失败按既有策略且只进入一次、超限429。先文档决策再改，不等待用户额外确认，不构建。服务使用的Redis实际连接已通过依赖确认；最终运行退出成功作为复现修复验证。

- database_schema：14:49 授权范围已全部落盘，停止源码编辑。AuthFilter 使用 Mono.defer+subscribeOn(boundedElastic) 覆盖同步认证和 Cookie 配置读取；DynamicRateLimitFilter 计数 onErrorResume 已收窄到下游之前，删除链路重放。新增 AuthFilterThreadBoundaryTest 3项、DynamicRateLimitFilterFailureBoundaryTest 4项，共7项待主代理统一执行；git diff --check通过，未构建未部署。根因已核实为项目默认Redisson 3.27.0 明确禁止 redisson-netty 线程同步命令，TokenService吞异常变401；不是先前猜测的Lettuce。决策、依赖字节码证据及实施结果见 backend-simplification-runtime-review.md，主代理可立即串行gateway验证部署。

## 主代理最终验收完成

全部分工已收口；主审计文档为最终状态依据。最后OA/HR/Gateway构建、前端类型检查/构建、最终SQL隔离验证与正式库对应修正全部通过；63项测试无失败/错误/跳过；实际登录/退出、8核心接口、费用与候选人/简历契约及租户隔离通过。Redis0误清6720条已完整恢复、正确Redis10清理17362条均如实记录；已知业务接入缺口明确保留，无待执行代码改造项。

## 15:23 contract_review 紧急收尾
用户要求java -jar原生运行并再次清库重导，已完成。运行验收新发现OA发出的SystemNoticeCreatedEvent.createTime为yyyy-MM-dd HH:mm:ss，workflow consumer使用ISO反序列化失败（信封occurredAt已ISO，遗漏业务载荷）。请立即修复单一通知事件时间契约：优先SystemNoticeCreatedEvent属性明确ISO序列化且保留纳秒（核实core现有依赖，不无端加框架），或最小提供端固定事件writer；页面格式不变，消费者不新增兼容。补OA构建真实ObjectMapper到workflow默认mapper往返测试；先写backend-simplification-runtime-review.md决策后改造，不跑构建不操作服务器。消息错误正文已由主代理确认：InvalidFormatException SystemNoticeCreatedEvent[createTime] index10。

- contract_review：15:23 修复已落盘并停止编辑。SystemNoticeCreatedEvent.createTime 用已有 Jackson JsonFormat 固定 ISO T 分隔＋9位小数秒，保留纳秒，未新增依赖/消费者兼容/页面配置。新增 OA SystemNoticeEventTimeContractTest 3项，真实OaJacksonConfig到Spring默认mapper的信封/业务载荷往返、页面格式不变/null、旧格式拒绝；diff检查通过，未构建。主代理可立即OA -am verify，更新最新core的OA/Workflow运行包并验收新通知。决策及边界见 runtime-review.md末尾。

- contract_review：本次 NEW_TASK 正文仍为空，尚无新派工记录；已只读核对15:41 OA/Workflow install与15:43运行打包成功，通知时间3测试全部通过，回写runtime-review。请主代理将新范围写入协调文档；本代理未继续改源码、未构建或连接服务器。
## 15:48 contract_review 只读复核补派
通知修复install与可运行包已完成，主代理部署中。请只读确认SystemNoticeCreatedEvent是否只有OA生产及Workflow消费（仅更新这两个服务是否足够）；统计当前全后端surefire XML实际测试总数及失败错误跳过；复核受控内部通知验证所需字段和成功消费证据。禁止修改代码、构建及服务器操作；最终直接回复三项结论即可，不改文档。

- seed_runtime_review：收到新 NEW_TASK 但 Payload 为空，目前协调记录与专项文档暂无本次范围。已读最终重导验收和分批提交状态，上一项种子工作无待办；请主代理将本次具体事项追加本文件或专项记录。本代理暂不编辑代码/SQL，不构建、不连接服务器。

## 当前新任务：版本合并（所有代理立即读取）
主代理已准备真实Git合并，dev=远程e0b9e7d2，合入audit分支a108298d，当前36冲突。你的详细任务写在 cloudflow-backend/docs/version-consolidation-20261102.md 的“分工”章节：database_schema负责DB及种子，contract_review负责Workflow/HR及相关前端，seed_runtime_review负责Auth/Gateway/公共模块。请立即按你名字对应范围实施冲突语义合并，不再回报无任务。不要构建，不操作git索引或服务器，结果写新分工文档。用户明确要求合并、推送并清理其他分支，保留本地dev/master，远程master/XinYuan不变。

主代理跨域补充：OA会议meeting_id/schedule_event_id及邀请应答字段已按新用途保留，请database_schema同步SQL。OA通知已被远程统一消息中心替代，旧SysNotice类不存在；主代理已将OA时间契约测试的页面格式验证换为普通LocalDateTime页面对象，不恢复旧通知表/服务。SystemNoticeCreatedEvent当前由AuthMessagePushGateway生产，公共事件注解仍保留有效。各代理请检查自己范围新增测试中的var并改为显式类型，避免违反新AGENTS。

## 平台合并完成后的补派（seed_runtime_review）
你已完成平台分工，请接着独占修正你发现的OA/CRM部门负责人链路：OaOrganizationService/OaIdentityMapper及引用VO，CrmSlaService/员工投影相关精确文件，统一sys_dept.leader_user_id及按ID查同租户人，禁止继续用户名/昵称猜测，保留远程新业务用途；记录决策与结果到version-merge-platform.md。主代理不会编辑这些文件；勿构建。可用rg搜索OA/CRM leader/getLeader字段。完成后告知精确文件及新增必要验证。

17:05 主代理构建反馈：公共模块、Auth/Gateway及依赖install通过。前端type-check失败：ProcessTrace.tsx198/199与TaskHandleModal.tsx468仍读取已删除的FlowchartNode/Edge.label；HrResumeParsePanel426/430的reviewRemark、436/438的rawText类型缺失。contract_review请处理这三个组件及HR类型与新版真实后端字段的一致性（授权扩展ProcessTrace和TaskHandleModal，主代理不碰）。报表ReportFilterEditor/ReportResultView/ReportShareDialog三个组件目录缺失由主代理处理。

## 新版缺失组件补派（seed_runtime_review）
OA/CRM负责人补派已完成。主代理type-check实际发现远程dev提交缺失前端src/components/reports整个目录：ReportFilterEditor.tsx、ReportResultView.tsx、ReportShareDialog.tsx和report.css，git ls-tree远程也没有。请先核实可从本机已有源码/历史恢复（不要无界扫描），若没有，按ReportChartPage/ReportDashboardPage调用签名、services/api/report.ts和已有scripts/verify-report*.mjs期望补齐可用组件；沿用现有公共ECharts封装/样式。修正.gitignore中 reports/ 对源码目录误忽略为 /reports/（你可独占改此一行）并添加四文件供主代理提交，不能仅用空组件让类型通过。原页面功能包括6类图表、统计列/单位、查询截断提示、筛选AND/OR、分享确认，按既有前后端契约保持。记录version-merge-platform.md末尾，禁止构建和Git暂存。主代理将统一type-check/build。这是合并后真实构建阻塞缺口，需完成。

## 数据库验收补充（database_schema）
你的SQL已开始主代理隔离库导入，勿继续改SQL除非发现真实错误。请只读核实contract_review报告的HR业务类型HR_OFFER统一后，06/07及生成器是否仍按businessType=OFFER/ONBOARDING生成，而非候选人status=OFFER；若需同步先报告精确位置，并在version-merge-database.md记录，不重生成等主代理协调。

17:12 contract_review范围更新确认：请主动读取本协调文档17:05构建反馈；主代理已授权你处理ProcessTrace、TaskHandleModal、FieldPermissionDialog的单一title/condition字段，以及HrResumeParsePanel rawText/reviewRemark新版真实字段。你可直接做，不用再等消息。当前OA/CRM构建进行中，之后Workflow/HR统一构建，需要你完成测试适配后明确交付。

17:21主代理反馈：隔离库cloud_flow_merge_20261102_170929已成功导入01—07，376表6990列（较374静态定义多sys_log_archive与sys_api_error_log_archive），50租户管理员、负责人同租户、费用四周期、待执行消息0、旧通知表0检查通过；未动正式库。OA测试适配发现refreshTree为private，已改为验证实际list调用；不改生产可见性。新版报表补齐后仅需完成可用页面组件的类型/构建和必要静态渲染检查，不要求登录真实服务器旧版或整站浏览器回归，避免扩大当前版本合并任务。

- seed_runtime_review：缺失报表4文件已全部补齐并停止编辑，.gitignore只将reports/改为/reports/，可被Git正常发现；记录见version-merge-platform.md。六类图、精确字符串表格/指标、AND/OR二层20条件、IN100值校验、分享确认、缺费用日期独立汇总、响应式样式已实现。TS语法0错误、CSS解析和diff检查通过，未构建/未浏览器验证，请主代理统一type-check/build及现有verify-report-ui.mjs；仪表盘48px行高+12px间距匹配60px拖动步长。

## contract_review最后前端补派（已由主代理完成，勿重复）
上项已交付。请立即处理主代理17:05 typecheck失败项：ProcessTrace.tsx198/199直接使用标准nodes/edges不再映射label；TaskHandleModal.tsx468改title；找到FieldPermissionDialog去掉node.label；HrResumeParsePanel426/430 reviewRemark及436/438 rawText按新版真实后端存在与否统一类型或页面。你有上述文件修改权限，此任务须实际修复，不能只写跨分工提醒。主代理不碰这些文件。无需再改后端，后端构建即将开始。

## 当前补派：seed_runtime_review 前端最终验证
主代理已亲自修复上述流程与HR页面字段问题。请你独占前端验证：运行 npm run type-check，成功后 npm run build；仅修真实错误。对新补报表组件做必要静态渲染或局部交互验证，不登录服务器旧版本、不做整站验收。可编辑前端及version-merge-platform.md，禁止Maven、git索引/提交、服务器操作。记录命令结果、检查范围与限制；临时文件写系统TEMP并在完成后按AGENTS记录清理。主代理同时进行后端构建，不运行npm。任务完成后停止。

## 当前补派：contract_review 人事构建修复
Workflow及全部公共依赖clean install已成功；HR编译成功但15测试中HrResumeParserContractTest.editingRoundTripPreservesSchoolAndArraysAndIgnoresBodyTenant报“手机号需按格式填写+国家区号”，日志系统TEMP/cloudflow-merge-business-final.log。请检查新版真实校验并修测试数据，保留正确手机号校验与数组/租户断言；只编辑HR及version-merge-business.md。主代理暂不运行Maven，授权你串行运行 mvn -B -ntp -f cloudflow-backend/pom.xml -pl .,cloudflow-service-hr install 验证，成功后立即报告并停止。禁止Git索引和服务器操作。

## 最新用户追加：更新服务器
用户明确要求本次统一版本更新服务器，故此前“不部署合并版”范围已取消。主代理将于本地验收后更新六个java -jar服务与前端，按已授权测试数据全量重建cloud_flow_db，数据库与Redis保留Docker。各代理不得自行部署或清理前端dist/后端target；这些产物当前仍用于部署。隔离库cloud_flow_merge_20261102_170929与其/tmp SQL已验证后清理，业务库未动。

## 当前补派：database_schema 部署配置只读预检
请并行只读比较新版本地 config/*.yaml、六服务application.yml 相对f576fd1a变化，以及服务器/data/cloudflow/runtime/config/和/data/cloudflow/native.env（仅读取，不输出密码或密钥）。评估新增功能是否需要同步外部配置、系统环境变量；重点新版消息中心、IM/报表、HR敏感加密配置、Job地址等。服务器192.168.1.173，凭据沿用用户已给出的root，环境注入后连接；可参考scripts/demo_seed_server.py，但禁止服务器写入、禁止Git索引及构建。结果写docs/version-merge-deployment.md，列出具体必须同步的键和推荐做法，秘密只标已具备/缺失。不需要执行全站回归或重建数据。完成后停止。

- seed_runtime_review：前端最终验证完成并停止：type-check通过；npm.cmd run build -- --outDir TEMP/dist通过（4393模块、48.98秒、图表检查22文件）；新增可复用scripts/check-report-components.cjs的23项静态渲染检查全通过。未发现新源码错误，未浏览器绘图/分享/整站验收。部署产物保留C:/Users/Administrator/AppData/Local/Temp/cloudflow-report-final-fbc8f2479ae440deb181c7c62b0c1937/dist，已通知主代理。临时verify-report-static.cjs与render.cjs共5357293字节的精准非递归清理被自动审批blocked by policy拒绝，两副本保留；完整结果和限制见version-merge-platform.md。
