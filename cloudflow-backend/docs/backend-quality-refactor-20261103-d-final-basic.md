# OC10 与 OC12 最后两项基本验证

2026-11-03 18:11—18:13（Asia/Shanghai），子代理 `oa_final_basic` 在唯一工作区 `D:\CloudFlowPro` 补齐登记表中的两项基本验证缺口。未修改生产代码、SQL、共享 target、服务器、MySQL 或 Git 索引；没有启动新的业务应用。所检查的 OA 部署包 SHA-256 为 `4c813ee364cf1a8db008fbabdf6dbee6b3cf15d61bff962ce73e6fd78de5d96b`。

## 结果与验证边界

| 登记项 | 已通过的实际检查 | 边界 |
| --- | --- | --- |
| OC10 旧申请人身份 | 调用真实 `BusinessTripServiceImpl.submitTrip` 和 `ExpenseClaimServiceImpl.submitClaim`：旧单据 userId 为空或属于其他用户均返回所有权错误403，userId保持原值；空申请人在状态转换、账户锁、写入前被拒绝。本人出差单通过真实状态机到受控写入口，旧缺失 userName/deptId/deptName 保持为空，未从当前上下文补写。本人报销单访问真实申请人锁入口，账户缺失明确失败且保持草稿，旧缺失身份字段不补写。 | Mapper/更新结果受控；正常报销完整提交沿用前述 OC13 的真实 MySQL 检查。此项不新增数据库、HTTP或浏览器证据。 |
| OC12 会议参会人读取 | 真实 `prepared` 和 `synchronize`、实际 MyBatis XML参数生成，共40项断言通过：准备阶段一次批量读取、保存阶段事务内重新一次批量读取，逐人读取会让检查立即失败；自动补发起人、按编号排序、不改调用方集合；批量返回乱序时仍按编号匹配姓名；所有邀请保留租户/会议/版本；准备后账户失效时保存阶段重新读取并拒绝，受控事务资源回滚部分写入；缺事务、重复编号、缺登录上下文、准备阶段用户无效均拒绝。 | Spring TransactionTemplate及服务方法真实执行，事务资源和Mapper为内存替身；不将该回滚结果记为真实 MySQL 回滚。实际 users XML绑定明确包含 tenant_id、deleted=0、status='0' 和全部编号，未执行SQL。 |

可复用源码：`scripts/quality-checks/OaFinalBasicChecks.java`，运行器 `scripts/quality-checks/run-oa-final-basic-checks.py`。默认检查两组；`--only applicant` 与 `--only meeting` 用于仅复测关联组。运行器读取本轮正式 OA 可执行包及原始应用包，只在独立忽略目录展开运行依赖，不写共享构建目录。

首次运行 `python scripts/quality-checks/run-oa-final-basic-checks.py`，OC10全部断言完成后进入OC12，在第一笔会议准备时因检查输入 `LocalDateTime.now()` 带非零纳秒而被既有正式秒精度规则拒绝，退出1。失败发生在测试输入，不涉及生产代码；改为 `.withNano(0)` 后仅复测失败的OC12及关联Mapper，命令 `python scripts/quality-checks/run-oa-final-basic-checks.py --only meeting` 退出0，输出 `PASS: OA final basic checks=40; scope=meeting; real_services=true; real_database=false`。没有重复已通过的OC10，也没有扩大回归范围；初次整条命令未记为通过。

最终检查Java源码没有var声明，运行器AST语法检查通过；独立javac编译成功。原有OA模块编译与六服务package结果仍按主记录读取；本次未额外构建生产模块，未执行全项验收。

## 产物交接

本轮输出仅在 `D:\CloudFlowPro\.cloudflow-runtime\quality-oa-final-20261103`，253个文件、140769129逻辑字节，包含246个临时依赖、检查class、参数和日志。已核实输出中无受版本控制文件、无目录链接、无Java/javac/Python运行引用；D盘记录可用43110957056字节。未执行删除：共享会话此前已出现同类删除自动审批拒绝，按主代理统一清理方案交接该固定目录，避免通过改工具绕过；Root需将此目录加入本轮清理脚本。可复用检查源码和本文继续保留，验收原材料不作为永久保留要求。

最终源码摘要：OaFinalBasicChecks.java=`df65186e1f9c94b915724e925a460c78f875a288219c03eac6dc9350ddf0ba1d`；run-oa-final-basic-checks.py=`7079c0800d8003067988949e1af8c3a6ba23397e0ebd248645a0d14dc79269a3`。清理后结果按本文读取，不能伪称重新验证已删除原材料。
