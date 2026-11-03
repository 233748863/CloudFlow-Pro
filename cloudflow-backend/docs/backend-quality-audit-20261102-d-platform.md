# D盘平台后端代码质量审计（2026-11-02）

本报告确认14项可简化实现、1项可删除的历史字段候选，另列3项需进一步定策略的发现。优先关注限流错误恢复可能重复调用下游、消息限额重复解密历史投递、用户/部门批量查询，以及登录密码历史兼容。以上为静态代码证据，未测量运行耗时，也未实际改造。

## 基线、范围与判定方法

唯一源码目录为 `D:\CloudFlowPro`，版本为 `e0b9e7d27b7690e5eac5f3c02be55b59a52924bf`。本报告独立检查D盘代码；桌面副本的旧结论不作为验证证据。用户已明确现有数据为可重建测试数据，因此历史数据兼容不作为永久保留理由；当前业务、安全与并发语义仍需保留。

静态清单见 [inventory.csv](backend-quality-audit-20261102-d-inventory.csv)。本分工覆盖 `cloudflow-auth`、`cloudflow-gateway`、`cloudflow-common` 全部子模块，共1143个清单文件、82282行，其中1080个Java、61个XML、2个YML文件；其中有2个测试源码文件，本轮未执行测试。Auth为671个文件/50069行，Gateway为26个文件/2539行，Common合计446个文件/29674行。文件清单与全域关键词扫描覆盖不等于逐方法验证。

方法为全域搜索历史兼容、异常兜底、反射、JSON转换及查询调用，再针对候选追踪入口、写入方、读出方、Mapper SQL及当前前端；比较当前与可收敛步骤，仅按能从源码推导的查询次数、对象数量或循环复杂度评价成本。P1表示优先处理的正确性或持续开销问题，P2表示局部性能/契约收敛问题，P3表示低成本但明确的维护冗余；等级不代表已测得生产故障。复杂度 `O(N)` 表示工作量随N线性增长，`O(N²)` 表示最坏按N的平方增长；N+1查询表示先查列表、再按每条记录继续查库。

下文引用均指D盘当前版本的源码行；`A` = `cloudflow-backend/cloudflow-auth/src/main/java/com/cloudflow/auth`，`G` = `cloudflow-backend/cloudflow-gateway/src/main/java/com/cloudflow/gateway`，`C/<模块>` = `cloudflow-backend/cloudflow-common/<模块>/src/main/java/com/cloudflow/common`。别名仅用于缩短文件清单，发现正文提供可定位文件链接。

## 已确认可简化的实现

### P01｜P1｜密码校验保留两套历史口令协议

证据：[PasswordService.java:21](D:/CloudFlowPro/cloudflow-backend/cloudflow-auth/src/main/java/com/cloudflow/auth/service/PasswordService.java:21)明确说明兼容历史前端SHA-256及直接BCrypt原密码；33–63行通过64位十六进制猜测输入，先验证规范化口令，失败再验证原口令。[AuthController.java:228](D:/CloudFlowPro/cloudflow-backend/cloudflow-auth/src/main/java/com/cloudflow/auth/controller/AuthController.java:228)使用带历史标志的结果，252–256行在旧密码成功时再生成新哈希并更新用户。当前实际迁移是Controller中的更新；`PasswordService:67–85`另有带审计日志的迁移方法，但本轮全Auth源码搜索未找到调用，不能把该方法的审计写入计为当前登录成本。

| 当前步骤/字段 | 建议步骤/字段 |
| --- | --- |
| 猜测输入格式 → 规范化 → BCrypt验证 → 失败后再次BCrypt → `legacyPlaintextMatch`分支 → 旧账号重算并写库 | 明确一种输入契约 → 一种哈希生成规则 → 一次BCrypt验证 → 正常认证 |
| `PasswordMatchResult(matched, normalizedPassword, legacyPlaintextMatch)` | 只返回认证实际需要的校验结果，删除历史迁移标志及无调用迁移助手 |

上下游：[前端auth.ts:217](D:/CloudFlowPro/cloudflow-frontend/src/services/api/auth.ts:217)在224行直接发送password；386–390行重置同样直接发送。全前端搜索仅找到`utils/crypto.ts:131`的`hashPassword`定义，未找到调用。IM绑定`A/im/ImBindingIdentity.java:57`、平台敏感操作`A/platform/PlatformAccessService.java:89`、消息投递人工处置`A/service/MessageDeliveryResolutionService.java:39`复用该校验，因此需一起收敛。

成本：非空错误密码在第一轮正常返回false时执行2次BCrypt验证；单一契约只需1次。历史账号迁移另有一次哈希生成及一次UPDATE。属于明确历史兼容；清库重建时可移除，但必须同步所有密码创建/重置入口和初始化种子，明确64位十六进制原密码、空格处理规则，保留密码哈希、登录限速、多因素认证和失败记录。建议验证普通登录、错误密码、重置后登录及复用校验的敏感操作，不以删除BCrypt降低成本。

### P02｜P1｜用户列表按每个用户重复查询角色和部门

证据：[SysUserServiceImpl.java:239](D:/CloudFlowPro/cloudflow-backend/cloudflow-auth/src/main/java/com/cloudflow/auth/service/impl/SysUserServiceImpl.java:239)查列表后在241–253行逐用户取角色及部门；292–299行每次取角色先查用户角色关联，再按角色ID查角色。

| 当前步骤 | 建议步骤 |
| --- | --- |
| 查用户 → 每用户查角色关联 → 每有角色用户查角色 → 每有部门用户查部门 → 填展示字段 | 查用户 → 批量查关联/去重角色/去重部门 → 按用户索引填展示字段 |

成本：N个用户、R个有角色用户、D个需查部门用户，查询数为 `1+N+R+D`，最大`1+3N`；按ID批量读取可收敛为4类查询，大批ID可按数据库限制分批。属于重复取数，未见历史兼容理由。保留租户过滤、权限约束、角色首项展示语义及排序；建议用相同用户列表比较字段输出和SQL次数，覆盖无角色/无部门情况。

### P03｜P2｜部门树、菜单树每层全表扫描，存在重复“是否有子节点”扫描

证据：[SysDeptController.java:48](D:/CloudFlowPro/cloudflow-backend/cloudflow-auth/src/main/java/com/cloudflow/auth/controller/SysDeptController.java:48)先用List.contains寻找根；70–100行`getChildList`遍历全列表，`hasChild`再次调用它，随后递归又读取。[SysMenuServiceImpl.java:171](D:/CloudFlowPro/cloudflow-backend/cloudflow-auth/src/main/java/com/cloudflow/auth/service/impl/SysMenuServiceImpl.java:171)到203行同样构建。

| 当前步骤 | 建议步骤 |
| --- | --- |
| 列表查父ID → 全表找子节点 → 再全表判断子节点是否有孩子 → 递归全表搜索 | 一次建立ID集合及parentId分组 → 从根按分组连接子节点 |

成本：树构造最坏O(N²)，分组连接可为O(N)；保留排序后不增加SQL。属于算法和重复检查冗余。部门61–63行“无根则返回原列表”是结构异常兜底，必须明确孤儿节点/循环数据策略，不能机械删除后改变返回。菜单100–123行的可见祖先与权限逻辑有真实用途，应保留。建议验证正常树、权限裁剪树、孤儿与循环引用的明确结果。

### P04｜P1｜部门变更对相交用户集合重复刷新，并对每个用户重新读部门表

证据：[SysDeptController.java:157](D:/CloudFlowPro/cloudflow-backend/cloudflow-auth/src/main/java/com/cloudflow/auth/controller/SysDeptController.java:157)成功后分别刷新本部门及父部门；[UserDataScopeService.java:115](D:/CloudFlowPro/cloudflow-backend/cloudflow-auth/src/main/java/com/cloudflow/auth/service/UserDataScopeService.java:115)先找子树用户再逐个refresh，83–94行重新查已读到的用户，49–76行逐用户查关联与角色；权限类型2在149–150行进入158–173行，再次全量查询部门和扫描ancestors。

| 当前步骤 | 建议步骤 |
| --- | --- |
| 刷新部门子树 → 查用户列表 → 逐人重新查用户/角色/部门 → 再刷新父部门子树重复处理相交用户 | 合并受影响部门和用户ID → 一次加载用户/角色关联/角色/部门快照 → 每个用户计算并刷新一次 |

成本：本部门用户通常也在父部门子树，交集中的K个用户会被刷新2次；每次类型2计算又读并遍历部门表。设需计算用户U、部门N，部门读取与扫描可达U次和O(U×N)。属于重复取数及重复刷新，数据权限刷新本身必须保留；部门移动需覆盖原/新父链，租户、用户版本与缓存失效语义均不可缩减。建议比较部门修改前后用户权限集合、刷新次数及跨租户隔离。

### P05｜P3｜已知类型的数据权限快照绕成Object、反射和泛型强转

证据：[UserDataScopeStore.java:21](D:/CloudFlowPro/cloudflow-backend/cloudflow-common/cloudflow-common-redis/src/main/java/com/cloudflow/common/redis/core/UserDataScopeStore.java:21)用Object入参，56–68行按方法名反射、Number/String转换、异常返回null；30–35行用无约束泛型强转。唯一save调用为`A/service/UserDataScopeService.java:94`，真实对象是[UserDataScopeSnapshot.java:14](D:/CloudFlowPro/cloudflow-backend/cloudflow-common/cloudflow-common-core/src/main/java/com/cloudflow/common/core/context/UserDataScopeSnapshot.java:14)的Long tenantId/userId。两个读取方分别为`C/cloudflow-common-data/datascope/RedisDataScopeHandle.java:130`与`C/cloudflow-common-security/security/interceptor/UserContextInterceptor.java:77`，也使用同一类型。

| 当前步骤/字段 | 建议步骤/字段 |
| --- | --- |
| `Object` → 找getter → 反射调用 → Number/String转Long → 捕获所有异常 → 静默不保存；泛型get再强转 | `UserDataScopeSnapshot`入参/返回值 → 直接读取Long getter → 保存/读取 |

每次保存去掉2次反射查找与调用及类型猜测，主要收益是可读性和错误可发现性；没有证据表明需要支持其他真实类型。属于过度通用化，尚不能认定由历史数据产生。保留租户缓存键、有效期、失效和45–49行批量删除的有效编号校验；建议验证快照往返及两个消费入口。

### P06｜P1｜审计日志按每个变更字段重复计算同一份整对象JSON差异

证据：[DefaultAuditLogHandle.java:85](D:/CloudFlowPro/cloudflow-backend/cloudflow-common/cloudflow-common-audit/src/main/java/com/cloudflow/common/audit/handle/DefaultAuditLogHandle.java:85)遍历字段变更；109–118行在循环内部重复序列化oldVal/newVal、解析为JSON树并计算整对象差异。当前有效调用例如`A/service/impl/SysUserServiceImpl.java:353`、`SysRoleServiceImpl.java:119`、`SysDictTypeServiceImpl.java:218,304`均启用`diff=true`。

| 当前步骤 | 建议步骤 |
| --- | --- |
| 每个变更字段：序列化旧/新对象 → 解析旧/新JSON → 计算完整差异 → 设置相同快照 | 一次操作计算旧/新JSON及差异 → 字段循环复用计算结果 |

成本：k个字段变化时为2k次整对象序列化、2k次解析、k次差异计算；可收敛为2次序列化、2次解析、1次差异计算。属于循环不变计算，非历史兼容。保留字段级审计记录及高风险属性；是否把数据库中的重复整对象快照改成“一操作一快照”是独立存储模型选择，不在此项直接删列。建议验证多字段修改得到相同字段记录、快照和差异，敏感值脱敏策略不能因复用而弱化。

### P07｜P1｜网关限流错误兜底范围过宽，可能二次调用下游

证据：[DynamicRateLimitFilter.java:136](D:/CloudFlowPro/cloudflow-backend/cloudflow-gateway/src/main/java/com/cloudflow/gateway/ratelimit/DynamicRateLimitFilter.java:136)先INCR，再TTL检查，必要时EXPIRE；147–151行调用下游，153–156行在整个组合链上`onErrorResume`并再次`chain.filter(exchange)`。因此下游产生错误也会进入“限流计数异常”分支，这一控制流可静态确认；是否造成具体业务重复写入尚未运行复现。

| 当前步骤 | 建议步骤 |
| --- | --- |
| Redis累加 → Redis查TTL → 必要时设置TTL → 调用下游 → 整条链错误时再次调用下游 | Redis原子计数/到期 → 仅为Redis故障决定限流策略 → 下游只执行一次 |

成本：命中且启用规则的正常请求至少2次Redis往返，需要补TTL时3次；原子脚本可合并为1次，并避免计数与到期分离。`onErrorReturn(true)`还把TTL设置失败当作继续，可能留下无到期计数器。属于过宽错误恢复，非历史兼容；保留现有窗口、维度、突发额度和规则优先级。Redis故障是否放行须沿用明确策略，不能把任意下游异常都重试。建议验证下游主动失败时调用次数为1，Redis故障策略、窗口重置及超限响应。

### P08｜P2｜事件已保存eventId列，发送时仍重新解析完整payload取编号

证据：[OutboxPublisher.java:114](D:/CloudFlowPro/cloudflow-backend/cloudflow-common/cloudflow-common-event/src/main/java/com/cloudflow/common/event/outbox/OutboxPublisher.java:114)到117行同一envelope写入eventId列与payloadJson；[OutboxScheduler.java:60](D:/CloudFlowPro/cloudflow-backend/cloudflow-common/cloudflow-common-event/src/main/java/com/cloudflow/common/event/outbox/OutboxScheduler.java:60)发事件时调用103–109行`extractEventId`，将完整JSON解析为Map，异常则返回`unknown`。112–122行死信构造已能直接读event.getEventId()。

| 当前步骤/字段 | 建议步骤/字段 |
| --- | --- |
| 读OutboxEvent → 全payload解析Map → 取eventId → 异常时unknown → 发Stream | 读OutboxEvent → 使用明确的eventId列 → 发Stream |

每次发送省去1次完整payload解析及Map分配，消除伪编号兜底。重复字段中`event_id`用于幂等与索引，payload用于完整跨服务消息，均有用途，不建议删除event_id列。属于重复派生值读取，未证实历史原因；保留领取租约、成功标记、重试、死信以及来源身份核验。建议验证不同事件与重试的编号一致性，重建种子不得生成空eventId。

### P09｜P2｜站内消息在同进程先构双命名Map，再猜类型转换回事件对象

证据：[InternalChannelSender.java:41](D:/CloudFlowPro/cloudflow-backend/cloudflow-auth/src/main/java/com/cloudflow/auth/message/InternalChannelSender.java:41)到61行同时写入`recordId/noticeId`、`title/noticeTitle`、`content/noticeContent`、`messageCategory/noticeType`；[AuthMessagePushGateway.java:33](D:/CloudFlowPro/cloudflow-backend/cloudflow-auth/src/main/java/com/cloudflow/auth/message/AuthMessagePushGateway.java:33)到89行再次做Map形状判断、同义字段回退、Long/String猜测，再创建SystemNoticeCreatedEvent。注释明确兼容现有NOTICE客户端。

| 当前字段/步骤 | 建议字段/步骤 |
| --- | --- |
| ChannelSendContext → 两层Map及4组同义字段 → MessagePushGateway(Map) → 类型/空值/同义回退 → SystemNoticeCreatedEvent | 强类型站内推送输入 → SystemNoticeCreatedEvent → 运输边界一次生成客户端字段 |

上下游：`common-message/.../push/MessagePushGateway.java:9`定义Map契约，OA也有实现；`cloudflow-service-workflow/.../event/consumer/SystemNoticeCreatedEventConsumer.java:30–48`最终生成NOTICE，当前前端`src/hooks/useWebSocket.ts:158–160`和`src/services/api/notice.ts:71–73`确有两套字段接收。因此可明确删去同进程反复拆装，端到端字段统一必须覆盖这些消费者，不能单删NOTICE字段。

每次推送至少分配2个中间Map并存4组重复别名，又逐字段转换；主要是维护和对象分配成本。属于明确协议兼容。`MessageSendRequest.title/content/renderedContent`另有直接发送和人工重发真实用途（`MessageDeliveryService:101–110`），不能因“兼容”注释一并删除。建议验证正常站内消息、渠道测试、OA调用及WebSocket显示和跳转。

### P10｜P1｜消息接收人按多个部门反复读取全部门树，最后才去重

证据：[MessageDispatchService.java:375](D:/CloudFlowPro/cloudflow-backend/cloudflow-auth/src/main/java/com/cloudflow/auth/message/MessageDispatchService.java:375)到416行按ROLE/DEPT逐项查关联和用户；429–449行每个部门根都查询同租户全部有效部门，再循环扫完整列表直到集合不再变化。419–425行的接收人数上限在用户查询之后生效。

| 当前步骤 | 建议步骤 |
| --- | --- |
| 每个部门根：读全部门 → 多轮扫描展开 → 查用户 → 最终接收人去重；每个角色各查关联和用户 | 一次消息内合并根/角色ID → 部门一次读取并按父ID分组 → 合并候选用户后按约束批量读取/去重 |

成本：K个部门接收方产生K次全部门查询；N部门按逆序长链排列时，多轮扫描最坏O(K×N²)。角色重叠也重复取相同用户。属于重复计算，非旧数据兼容。保留当前租户、有效部门、有效用户、指定接收人覆盖逻辑、接收人去重和配置上限；上限不能作为前段全量取数无成本的依据。建议验证角色/部门重叠、父子部门、禁用用户与超过上限的行为。

### P11｜P1｜每次消息限额判断读取并解密当天历史投递

证据：[MessageDeliveryService.java:448](D:/CloudFlowPro/cloudflow-backend/cloudflow-auth/src/main/java/com/cloudflow/auth/message/MessageDeliveryService.java:448)到463行，对有分钟/日额度的渠道，逐条decode所有`recentAttempts`后才按channelId过滤。714–723行decode包含解密、JSON反序列化与归属核对；[SysMessageDeliveryMapper.xml:34](D:/CloudFlowPro/cloudflow-backend/cloudflow-auth/src/main/resources/mapper/SysMessageDeliveryMapper.xml:34)查询租户内send_time在当天且attempt_count>0的全部投递，没有按目标渠道筛选或数据库聚合。340–353行先锁投递、渠道和模板，再执行此统计。

| 当前步骤/存储 | 建议步骤/存储 |
| --- | --- |
| 锁渠道 → 查当天所有投递 → 逐条解密载荷 → 解析attempt列表 → 按渠道/时间累计 → 判额 | 保持额度并发保护 → 读取按租户/渠道/时间窗口可查询的尝试数 → 判额并登记此次尝试 |
| 尝试历史只在payloadEncrypted中；attemptCount为整条投递累计次数 | 可查询的尝试明细或事务一致的窗口计数；保留必要加密业务载荷 |

成本：已有D条投递、总A次尝试时，一次限额检查读取D条、解密/解析D次、遍历A次；顺序发送N条且每条仅一次尝试时，累计历史处理量可接近`N(N-1)/2`。多渠道仍读取同租户其他渠道记录，并延长渠道锁持有时间。SQL按record.send_time筛选，重试发生时间在attempt中，两者跨日时还需核对统计口径。

确认重复扫描；具体数据模型需谨慎选择，这是本项的业务边界。不能用COUNT(delivery)直接替代attempt数，因为存在重试和渠道切换；也不能为省查库删除限额、锁或未知外发结果。建议验证分钟/日边界、跨日重试、渠道切换与并发发送，并比较扫描/解密次数；本轮未给出节省比例。

### P12｜P2｜报表读请求反复全量注册补缺，再逐数据集查询

证据：[ReportDatasetService.java:28](D:/CloudFlowPro/cloudflow-backend/cloudflow-auth/src/main/java/com/cloudflow/auth/service/report/ReportDatasetService.java:28)的list及43行require均调用81–100行`ensureRegistered`：读取租户全部注册行、构集合、遍历定义、缺失时INSERT；list在34行又逐个byCode查询。对应[SysReportDatasetMapper.xml:4](D:/CloudFlowPro/cloudflow-backend/cloudflow-auth/src/main/resources/mapper/report/SysReportDatasetMapper.xml:4)为SELECT*，13–18行为INSERT ON DUPLICATE KEY无变化更新。

| 当前步骤 | 建议步骤 |
| --- | --- |
| 每次读取：扫全部注册项 → 按需写入 → 列表逐项再查；查询执行前后各require一次 | 租户初始化/版本发布完成注册 → 读取只查并验证；列表一次批量取注册项 |

成本：正常已注册情况下，列出M个可见数据集仍需1次全量查询+M次按code查询；`ReportQueryService.java:27,45`执行前后各require使每次业务查询附带两次全量注册扫描。属于读路径自修复冗余，未见必须为历史数据保留的依据。保留执行前后权限/停用状态复核，以及66–78行元数据一致性验证；只把注册移出读取。建议验证新租户、升级新增定义、停用和查询期间权限变更，初始化失败应明确失败，不把缺注册当正常空列表。

### P13｜P2｜定时任务列表先取全量再内存分页

证据：[JobPlatformService.java:167](D:/CloudFlowPro/cloudflow-backend/cloudflow-auth/src/main/java/com/cloudflow/auth/service/JobPlatformService.java:167)到180行selectList所有匹配任务并转换全部VO，再在1285行page中subList；同文件314–333行任务日志已经使用数据库selectPage，可作为同模块可复用模式。

| 当前步骤 | 建议步骤 |
| --- | --- |
| 查询N条任务 → 构造N个VO → 切P条返回 | 数据库计数/分页查P条 → 构造P个VO → 返回 |

返回P条时当前数据库传输及Java对象构造按N增长，数据库分页可将页内容传输/构造收敛到P，计数另计算。属于实现冗余，非历史兼容。保留租户、过滤、排序和页大小规则；任务运行幂等与租约与列表无关，不在此项删减。建议验证筛选、第一页/末页/越界页与总数一致。

### P14｜P2｜HR文件授权仍识别旧PUBLIC证书地址

证据：[HrFileAccessChecker.java:62](D:/CloudFlowPro/cloudflow-backend/cloudflow-auth/src/main/java/com/cloudflow/auth/download/HrFileAccessChecker.java:62)到74行明确标注历史HR PDF，并允许`PUBLIC + hr-pdf + 旧URL模式`或PRIVATE但旧URL的组合；当前写入方[HrFileStorage.java:68](D:/CloudFlowPro/cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/service/HrFileStorage.java:68)到78行固定url空字符串，[HrFileStorageMapper.xml:7](D:/CloudFlowPro/cloudflow-backend/cloudflow-service-hr/src/main/resources/mapper/HrFileStorageMapper.xml:7)到13行固定PRIVATE。全Auth/HR生产源码与DB搜索旧URL前缀只命中兼容识别逻辑。

| 当前字段/步骤 | 重建后的字段/步骤 |
| --- | --- |
| PRIVATE可空URL或旧URL；PUBLIC需类型/remark/configId/旧URL正则组合判定 | 当前HR文件PRIVATE、空URL → 统一授权读取 |

属于明确历史记录兼容，重建后可移除旧分支；收益主要为减少字段组合推断和维护歧义。`sys_file.access_type/url/config_id/remark`被其他存储业务使用，不能据此全表删列；HR LOCAL文件本来可无configId。保留上游业务绑定、租户、文件用途、删除状态和内容摘要核验。建议验证新建员工/培训证书授权下载及越权拒绝，无需为旧PUBLIC测试数据维护迁移链。

## 数据库字段专项

### D01｜P2｜sys_role.data_scope可作为重建删除候选，ds_type/ds_scope保留

证据：[01.cloudflow-common.sql:221](D:/CloudFlowPro/cloudflow-backend/DB/01.cloudflow-common.sql:221)到223行同表存在两套权限类型；当前[SysRole.java:25](D:/CloudFlowPro/cloudflow-backend/cloudflow-auth/src/main/java/com/cloudflow/auth/domain/SysRole.java:25)到33行仅映射dsType/dsScope，`UserDataScopeService:70–76,135–152`和`A/oauth2/OAuthActors.java:77–100`使用此二者计算；前端[RoleList.tsx:84](D:/CloudFlowPro/cloudflow-frontend/src/pages/system/RoleList.tsx:84)、476–477、594–601行同样操作dsType/dsScope。

| 字段 | 当前数据库含义 | 当前应用读写证据 | 决策 |
| --- | --- | --- | --- |
| `data_scope CHAR(1)` | 1全部、2自定、3本部门、4本部门及以下 | 平台生产Java/Mapper未发现该列读取；DB初始化仍写 | 重建删除候选，同时改两份种子列清单 |
| `ds_type INT(1)` | 0全部、1自定、2本级及下级、3本级、4本人 | SysRole、权限计算、OAuth和前端均使用 | 保留 |
| `ds_scope VARCHAR(500)` | 自定部门ID逗号列表 | 自定权限计算及角色编辑使用 | 保留；字段值格式统一可另审 |

两套类型枚举数值含义不同，不能将data_scope直接重命名或数值复制到ds_type。初始化写入证据为`DB/06.cloudflow-business-seed.sql:655–669`及`DB/07.cloudflow-demo-seed.sql:440`。成本主要是重建种子、理解与错误使用风险，未量化数据库空间收益；不声称存在当前双列运行时回退。属于旧权限模型残留，高确定候选；删除前应将全项目SQL/实体/脚本引用搜索与主报告跨模块结果合并。建议验证新库导入、角色编辑和0–4五类数据权限。

## 需要区分当前兼容、业务语义和错误恢复的发现

| 编号与等级 | 证据、当前行为和成本 | 可收敛方向、不能直接删除的边界与验证 |
| --- | --- | --- |
| B01，P2，事件编码多形状/时间格式；确定存在，历史性质未全定 | [BusinessEventEnvelopeCodec.java:14](D:/CloudFlowPro/cloudflow-backend/cloudflow-common/cloudflow-common-event/src/main/java/com/cloudflow/common/event/core/BusinessEventEnvelopeCodec.java:14)到30行支持JSON对象或包裹JSON的字符串、payload支持对象/字符串；46–53行依次尝试3种时间格式，后两种会先产生解析异常。当前发布器写JSON字符串，`C/cloudflow-common-redis/redis/core/RedisStreamUtil.java:76–78`用RedisTemplate写Stream；`C/cloudflow-common-redis/config/RedisConfig.java:43–45`使用JSON序列化Hash值，而`C/cloudflow-common-event/event/config/EventConsumerAutoConfiguration.java:59–66,198–199`按String读取，存在当前运输层再次编码的依据 | 当前：对象→JSON字符串→运输层JSON→二次解码；目标：专用事件运输明确一种序列化→单次解码。先核验实际Redis消息字节与生产配置覆盖，不能只删二次readTree。时间格式单独确定时区契约；offset解析后toLocalDateTime丢弃偏移，不能直接假定等价。建议静态统一生产者并做一次事件往返验证；本轮未读取服务器Redis。 |
| B02，P1，缺租户时默认归入100000；需确定系统操作契约 | `DefaultAuditLogHandle.java:70–78`读不到租户后找默认配置，再异常则100000；`AuthMessagePushGateway.java:43,64`先上下文回退，再将空租户变100000。当前步骤为多来源猜测→固定值，增加静默误归属可能；本轮没有证明这些缺上下文路径已在线发生或产生越权 | 目标：业务入口提供明确租户，系统操作显式指定归属；将真正无租户的全局审计定义单独处理。保留必要后台系统调用，不机械改成一律抛异常。建议核验异步/定时任务实际上下文，覆盖租户缺失时的失败或全局记录策略；不能把固定默认当数据修复。 |
| B03，P2，审计异常或不支持类型被归为空变化；需确定日志失败策略 | [DataAuditor.java:40](D:/CloudFlowPro/cloudflow-backend/cloudflow-common/cloudflow-common-audit/src/main/java/com/cloudflow/common/audit/support/DataAuditor.java:40)到64行把新增/删除单边null、简单/集合类型、任何比较异常都返回EMPTY_CHANGES；`DefaultAuditLogHandle:59–60`跳过，85–87行仅处理ValueChange。另`A/service/report/ReportDefinitionService.java:56`使用`spel="#input"`，`AuditAspect:30–37`与`JaversCompareHandle:31–35`前后取同一入参，需核对该类操作是否有预期审计结果 | 当前：失败或不支持→空变化→无记录；目标：明确支持的快照类型→显式新增/删除/比较失败状态。主要为可观测性和审计完整性，未证实需要比较所有Map类型，不建议泛化一套更多兜底。策略需确认是否影响主事务；建议选当前用户/角色/报表真实入口核对落库内容，再定范围。 |

## 应保留的检查及字段反证

| 位置 | 保留原因 |
| --- | --- |
| `A/message/MessageDeliveryService.java:72–93,340–374,714–723`；OutboxPublisher:33–64；事件消费者租约与失败状态处理 | 同源内容一致、租户归属、领取所有权、渠道限额与UNKNOWN/RETRYABLE状态服务于实际并发和外发结果不确定性。省略这些步骤可能重复发送或把未知结果当成功；P11只收敛限额取数。 |
| `A/im/ImBindingIdentity.java:49–75`、`A/im/ImTodoSender.java:31–65`、`A/portal/PortalFileTickets.java:36–61` | 通信绑定在密码验证期间重核身份/版本，待办发送在远程取投影后重核账号，门户票据绑定身份/会话/文件并原子消费。这些重复校验跨越外部调用或可变状态，不能仅按调用次数删减。 |
| `A/service/report/ReportQueryService.java:27–59`与ReportDatasetService:66–78；`A/storage/FileStorageRegistry.java:39–45`；`A/service/JobPlatformService.java:314–333` | 报表执行前后权限和元数据验证有真实用途；field_meta/default_filters/permission_code等列当前用于固定元数据核对，不能仅因与代码相似删列。文件configId为空仍覆盖当前HR LOCAL写入，存储类型/配置ID各有用途。任务日志已数据库分页，P13仅针对任务列表。 |

`FileStorageRegistry.java:51–55`每次getService创建EnumMap并遍历固定服务列表，可在初始化时建索引；属于低成本局部维护优化，未单列为确认项，也未证明所有远程别名分支都属旧兼容。网关`AuthFilter`已将verifyToken移至专用阻塞执行线程，不能复用旧版“整个鉴权在响应线程阻塞”的概括；本轮P07仅覆盖已核实限流逻辑。

## 深入审阅清单与限制

实际深入审阅的关键链路按三个领域归组，未列出的文件只有清单/关键词扫描，不宣称逐方法验收：

| 领域 | 文件及链路 |
| --- | --- |
| 用户、权限、文件 | A/service/PasswordService、A/controller/AuthController、A/service/impl/SysUserServiceImpl、SysRoleServiceImpl、SysMenuServiceImpl、A/controller/SysDeptController、A/service/UserDataScopeService、A/domain/SysRole、A/download/HrFileAccessChecker、A/storage/FileStorageRegistry；common-core/UserDataScopeSnapshot、common-redis/UserDataScopeStore、common-data/RedisDataScopeHandle、common-security/UserContextInterceptor；HR/HrFileStorage及Mapper，前端auth/RoleList |
| 消息、事件、入口 | A/message/InternalChannelSender、AuthMessagePushGateway、MessageDispatchService、MessageDeliveryService及SysMessageDeliveryMapper；common-message/MessageSendRequest、MessageSender、MessagePushGateway；common-event/OutboxPublisher、OutboxScheduler、BusinessEventEnvelopeCodec、EventConsumerAutoConfiguration；common-redis/RedisStreamUtil、RedisConfig；G/ratelimit/DynamicRateLimitFilter、G/filter/AuthFilter；A/im/ImBindingIdentity、ImTodoSender，A/portal/PortalFileTickets；Workflow通知消费者、前端useWebSocket/notice |
| 审计、报表、任务与数据库 | common-audit/AuditAspect、JaversCompareHandle、DefaultAuditLogHandle、DataAuditor；A/service/report/ReportDatasetService、ReportQueryService、ReportDefinitionService及SysReportDatasetMapper；A/service/JobPlatformService；DB/01.cloudflow-common.sql及06/07角色种子 |

本轮未改业务Java、SQL、配置或前端；未编译、未启动服务、未运行测试、未接触服务器/数据库/缓存、未提交或推送。各项“建议验证”为未来改造验收，不是已通过记录。未对每个新增IM、门户、导入、报表、任务方法作逐行证明，也未确认所有第三方客户端或外部SQL使用；结论只覆盖文中实际引用链路。没有生成构建包、截图、独立测试环境或临时日志。

全部P01–P14、D01与B01–B03当前状态均为“审计记录，未改造”；后续每项完成后应单独回写实际决策、修改文件、验证范围与结果，不能把建议标成完成。
