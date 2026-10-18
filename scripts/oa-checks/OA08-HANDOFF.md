# OA-08 源码与验证交接

2026-09-14。源码已收束；真实运行验收未执行。原运行库尚未按 H 正式结构重导，不可据离线检查宣称线上可用。

未编辑 01/02/03/05/06/07 SQL、共享 common、workflow、HR、全局布局、菜单 hook、路由或依赖清单；未写运行库，未重建、启停服务、提交或创建分支。保留原工作区历史修改。主线程负责 06/07、业务类型注册、共享防自审、公共日志保护及全量构建。

## 已实现与文件范围

`cloudflow-backend/DB/04.cloudflow-oa.sql`：扩展 `oa_consumable`，新增 `oa_consumable_ledger`、`oa_consumable_request`、`oa_consumable_request_item`；OA 正式定义 87→90 表。没有迁移包或其它表结构改动。

以下 Java 路径均相对 `cloudflow-backend/cloudflow-service-oa/src/main/java/com/cloudflow/oa/`，仅认领所列业务文件及采购接线，不认领目录内其它历史修改：

| 路径 | 文件 |
| --- | --- |
| `domain/` | `SysConsumable.java`、`OaConsumableLedger.java`、`OaConsumableRequest.java`、`OaConsumableRequestItem.java` |
| `domain/dto/` | `ConsumableInput.java`、`ConsumableCommands.java`、`ConsumableQuery.java`、`ConsumableStockDTO.java`、`PurchaseReceiptDTO.java` |
| `domain/vo/` | `ConsumableResults.java` |
| `controller/` | `ConsumableController.java`、`ConsumableLedgerController.java`、`ConsumableRequestController.java`、`PurchaseRequestController.java` |
| `mapper/` | `SysConsumableMapper.java`、`OaConsumableLedgerMapper.java`、`OaConsumableRequestMapper.java`、`OaConsumableRequestItemMapper.java`、`OaConsumablePurchaseMapper.java`、`OaConsumableMaintenanceMapper.java` |
| `service/` | `IConsumableService.java`、`IPurchaseRequestService.java` |
| `service/impl/` | `ConsumableCostCalculator.java`、`ConsumableTransactions.java`、`ConsumableOperationSupport.java`、`ConsumableLedgerService.java`、`ConsumableReadService.java`、`ConsumableInventoryService.java`、`ConsumableServiceImpl.java` |
| `service/impl/` | `ConsumableRequestAccess.java`、`ConsumableRequestService.java`、`ConsumableApprovalService.java`、`ConsumableRequestApprovalHandler.java`、`ConsumableDispatchService.java`、`ConsumableRuleExecutor.java` |
| `service/impl/` | `ConsumablePurchaseService.java`、`PurchaseRequestServiceImpl.java`、`ConsumableLedgerVerifier.java`、`ConsumableMaintenanceService.java` |
| `job/` | `OaConsumableJobs.java` |

Mapper XML 路径：`cloudflow-backend/cloudflow-service-oa/src/main/resources/mapper/` 下 `SysConsumableMapper.xml`、`OaConsumableLedgerMapper.xml`、`OaConsumableRequestMapper.xml`、`OaConsumableRequestItemMapper.xml`、`OaConsumablePurchaseMapper.xml`、`OaConsumableMaintenanceMapper.xml`。

前端路径：

- `cloudflow-frontend/src/pages/admin/ConsumableLedgerPage.tsx`
- `cloudflow-frontend/src/pages/admin/ConsumableReportsPage.tsx`
- `cloudflow-frontend/src/pages/admin/ConsumableRequestPage.tsx`
- `cloudflow-frontend/src/pages/admin/consumable/ConsumablePage.tsx`
- `cloudflow-frontend/src/pages/admin/consumable/consumableUi.tsx`
- `cloudflow-frontend/src/pages/admin/consumable/ConsumableStockDialog.tsx`
- `cloudflow-frontend/src/pages/admin/consumable/ConsumableLedgerActionDialog.tsx`
- `cloudflow-frontend/src/pages/admin/consumable/ConsumableRequestEditor.tsx`
- `cloudflow-frontend/src/pages/admin/consumable/ConsumableIssueDialog.tsx`
- `cloudflow-frontend/src/pages/admin/consumable/ConsumablePurchaseSourceDialog.tsx`
- `cloudflow-frontend/src/services/api/consumable.ts`
- `cloudflow-frontend/src/services/api/consumableLedger.ts`
- `cloudflow-frontend/src/services/api/consumableOperation.ts`
- `cloudflow-frontend/src/services/api/purchase.ts`

菜单 component 必须是 `pages/admin/ConsumableLedgerPage`、`pages/admin/ConsumableReportsPage`、`pages/admin/ConsumableRequestPage`；报表使用 Reports 复数。对应 `/admin/consumable-ledger`、`/admin/consumable-reports`、`/admin/consumable-request`；主线程维护 1810/1817/1820，OA 分工不写菜单。

实现包含同事务通用日志/不可变台账/库存缓存、移动加权成本、收货/退回累计分摊、持久重放、审批不扣库存、分批发料与零实发行原结果、受限冲正、四类报表、低库存轮次去重和 CHECK/REBUILD。前端使用现有主题与组件；来源采购弹窗读取真实收货记录和冲正标识，提供按原体重试与核对后结束本机重试。没有新增附件功能。

## 真实接口契约

下列均为网关完整路径。新分页统一 `{rows,total,pageNum,pageSize}`，页码从 1 开始，每页最多 100；旧耗材列表保留 IPage 外形。新增 ID 和金额以字符串输出；整数数量上限 2147483647，金额上限 99999999.99 元。金额输入必须为十进制字符串且最多两位小数；新增报表合计数量用字符串，前端只在安全整数范围绘制单耗材/单单位图。

库存请求 `operationKey` 长度 1～64、格式 `[A-Za-z0-9:_-]+`；原因 `remark` 去首尾空白后 1～255 字。重复请求必须复用原键、原数量、原版本和原请求体；同键不同内容或操作人返回 `IDEMPOTENCY_CONFLICT`。库存写、收货、创建/提交/发料及重算绕过短时 `RepeatSubmit`，使用 `@RepeatSubmit.Disabled`，在业务层持久防重。未确认浏览器请求保存在按租户/用户隔离的 sessionStorage，不保存令牌。

| 接口 | 入参 / 结果 | 权限 |
| --- | --- | --- |
| `GET /oa/consumable/list`、`/{id}`、`/{id}/logs`、`/low-stock`、`/replenishment-suggestions` | 原 API；主数据增加分类/状态/位置/版本，成本受限 | `oa:consumable:list` |
| `POST/PUT /oa/consumable` | 仅主数据白名单；编辑带 `consumableId,version`；不能传库存或成本缓存 | `oa:consumable:add/edit` |
| `DELETE /oa/consumable/{ids}` | 最多 100 个；有台账、采购、领用引用或库存即整批拒绝 | `oa:consumable:remove` |
| `POST /oa/consumable/{id}/add-stock` | `{operationKey,remark,quantity,unitPrice}`；免费必须显式传 `"0"` | `oa:consumable:add-stock` |
| `POST /oa/consumable/{id}/reduce-stock` | LOSS→盘亏；ISSUE 必须关联 `requestId,itemId,requestVersion` 并进入统一发料 | 原 `reduce-stock`，ISSUE 另检查 `dispatch`、`issue` |
| `GET /oa/consumable/ledger/list`、`/ledger/{id}` | 时间/耗材/交易/来源筛选；详情含来源单据 ID/版本、原日志、冲正及退回关系 | `oa:consumable-ledger:list` |
| `POST /oa/consumable/{id}/adjust` | `{operationKey,remark,quantity,direction:IN/OUT,unitPrice?}`；IN 必填单价 | `oa:consumable:adjust` |
| `POST /oa/consumable/{id}/scrap` | `{operationKey,remark,quantity}` | `oa:consumable:scrap` |
| `POST /oa/consumable/{id}/return` | `{operationKey,remark,sourceLedgerId,quantity,requestVersion}` | `oa:consumable:return` |
| `POST /oa/consumable/ledger/{id}/reverse` | `{operationKey,remark,purchaseVersion?或requestVersion?}`；仅最新原行整笔冲正，已退回/已付款等后续关系阻止冲正 | `oa:consumable-ledger:reverse`，另检查来源业务权限 |
| `POST /oa/consumable/{id}/recalculate` | `{operationKey,remark,version,mode:CHECK/REBUILD}`；返回 before/expected/after/consistent/changed/reason | `oa:consumable-ledger:recalculate` |
| `GET /oa/consumable/reports/stock/usage/cost` | 实际为 3 个独立后缀；from 含起点、to 不含终点，默认本月；usage 按耗材/部门/人员分组且叠加数据范围 | `oa:consumable-report:list`，cost 另需 `oa:consumable-report:cost` |
| `GET /oa/consumable/request/catalog`、`/categories` | 只读可领用目录、分类；无供应商保密或成本字段 | `oa:consumable-request:lookup`；categories 兼容耗材管理读取权限 |
| `GET /oa/consumable/request/list`、`/department-list`、`/dispatch-list` | 本人、授权部门、仓管独立入口 | 分别 `list`、`dept-list`、`dispatch` |
| `GET /oa/consumable/request/{id}`、`/{id}/dispatch-detail` | 主单、明细及实际流转；详情与对应范围一致 | 分别 `query`、`dispatch` |
| `POST /oa/consumable/request` | `{operationKey,purpose,applyDate,expectDate?,items:[{consumableId,applyQuantity,remark?}]}`；1～100 行，申请人/部门服务端取值 | `oa:consumable-request:add` |
| `PUT /oa/consumable/request/{id}` | 上述业务字段去掉 operationKey，增加 `version`；仅本人未发料 DRAFT/REJECTED | `oa:consumable-request:edit` |
| `POST /oa/consumable/request/{id}/submit` | `{operationKey,version}`；返回 `requestId,requestNo,status,version,instanceId?,approvalPending,replayed` | `oa:consumable-request:submit` |
| `POST /oa/consumable/request/{id}/cancel` | `{version,reason}`；仅本人未发料 DRAFT/REJECTED/APPROVED | `oa:consumable-request:cancel` |
| `POST /oa/consumable/request/{id}/issue` | `{operationKey,version,allowPartial,remark,items:[{itemId,quantity}]}`；原结果含 requested/issued/shortage 数量及 ledgerId，可有实际数 0 的返回行 | 同时 `oa:consumable-request:dispatch`、`oa:consumable-request:issue` |
| `POST /oa/purchase/request/{id}/receipt` | `{operationKey,purchaseVersion,remark?,items:[{itemId,quantity}]}`；价格只取已批准采购行，备注最多 500 字 | `oa:purchase:receipt` 并沿原采购所有权范围 |
| `GET /oa/purchase/request/{id}/receipts` | 分页真实原收货记录，增加 `ledgerId,reversed,reversalLedgerId` | `oa:purchase:list` 并沿原采购读取范围 |

库存记账返回 `{operationKey,replayed,ledgerIds,rows,sourceId?}`，rows 为本笔数量、单位、结存及有权可见的金额。旧采购 API 适配器保留原调用方式，首次补取真实采购版本；错误重试保留原体。导出 `getPendingConsumableReceipt`、`clearConsumableReceiptAfterVerification` 供采购页面后续复用；本分工不改 `PurchaseRequestPage.tsx`，台账页已有独立核对入口。

台账及申请估价读取成本要求 `oa:consumable-ledger:cost`，报表成本要求 `oa:consumable-report:cost`；无权字段服务端不序列化，不只是隐藏列。工作流快照不携带成本/估价/阈值金额。

## 工作流、任务与种子接线

业务注册由主线程添加：`businessType=OA_CONSUMABLE_REQUEST`、`processKey=oa_consumable_request`、`tableName=oa_consumable_request`、主键 `request_id`、实例列 `instance_id`。服务端 `ConsumableRequestApprovalHandler` 实现现有 `OaApprovalParticipant`，供既有 Outbox 和回调消费者动态发现，没有浏览器审批成功接口。

使用 `OaApprovalOutboxService.queue`、原事件 `OA_F_APPROVAL_SUBMITTED`、原预占令牌 `F:`、`oaRequestToken`、`APPROVAL_BOUND`。内部 variables 必须保持 `_hExcludedUserIds=[原申请用户ID字符串]`、`approverIds=[经同租户有效性及办理权限验证的审批用户ID字符串]`；当前为一个配置负责人，空候选及负责人就是申请人均拒绝。业务表保存本轮申请人/审批人/规则/预占快照；绑定与回调校验快照、实例、租户、真实 `ApprovalResultDTO.approverId` 和提交令牌。真实办理人必须匹配冻结负责人且不能是原申请人，旧实例和重复终审不改库存。

主线程仍需确保外部公共启动不可伪造上述保留变量，以及内部启动、任务办理、转派、加签、运维指派和终审均执行参与人排除；不能依赖默认 SelfApprovalPolicy。公共日志保护还需覆盖本项 DTO 金额和内部快照，避免绕过 OA 成本权限。

任务类：`com.cloudflow.oa.job.OaConsumableJobs`；无参 `public void oaConsumableStockWarning()`、`public void oaConsumableStockRecalculate()`，JobHandler 名同方法，均使用 `TenantIterator` 与 `DistributedJob`，按租户/耗材隔离并汇总异常。建议 1810/1811、默认 PAUSED，预警周期 300000ms，核对每天 02:30；本分工不写任务种子。

已接入 `ConsumableRuleExecutor`，通过原 `RemoteBusinessRuleService` 读取有效规则并记录命中；远程调用放事务外，规则不可用或命中记录失败即阻止提交。ALWAYS 每单审批；THRESHOLD 使用严格大于阈值，未知金额始终送审，QUANTITY 比较每行不混合单位。

配置：`sys.oa.consumable.approvalMode=ALWAYS`、`limitMetric=AMOUNT`、`approverUserId=<真实同租户审批用户>`、`stockManagerUserId=<真实同租户仓管用户>`、`recalculateMode=CHECK`；后四项同 `sys.oa.consumable.` 前缀。规则码 `oa.consumable.request.limit` 必须有匹配的 PUBLISHED 版本；分类字典 `oa_consumable_category`；消息模板 `OA_CONSUMABLE_LOW_STOCK` 使用 INTERNAL/BIZ_REMINDER，参数 `name/model/unit/quantity/threshold/linkUrl`。

期初要求：

- `oa_consumable` 先从 quantity/stock_amount/avg_cost=0 建立；非零期初用一次 MANUAL/INBOUND，来源主单及明细 ID 为空，事件 `SEED:OA08:<consumableId>:OPENING`。零数量不造流水。数量按原单位；unit_price 为人民币元/单位，amount 为人民币元，两位小数；金额必须有显式演示或真实开账依据。
- 台账必填业务列包括同租户耗材 ID/名称/单位、类型/有符号数量/结存、unit_price/amount/balance_amount_after/avg_cost_after、source_biz_type/source_event_key、operation_key/operation_line_no/operation_hash、asset_log_id、operator_id/operator_name、remark；其它按 04 默认或真实来源填写。hash 是 64 位小写十六进制。每笔先生成真实 `oa_asset_log.log_id`，台账 asset_log_id 同租户一对一；原日志 ref_type='2'、ref_id=consumableId、quantity_change=ledger.quantity、operator_id 一致、target_id=beneficiary_id（期初均空）。
- 采购来源严格 `PURCHASE_RECEIPT:<实际receiptId>`，source_biz_id=receiptId、source_item_id=真实采购明细 ID；正常领用 `CONSUMABLE_REQUEST:<requestId>:<itemId>:<operationKey>`，退回 `RETURN:<sourceLedgerId>:<operationKey>`，冲正 `REVERSE:<originalLedgerId>`，普通手工 `MANUAL:<operationKey>:<lineNo>`。最终库存按全部有符号流水派生。旧两组 5+3 耗材、7 条非零 ref_type='2' 散日志、相关采购收货必须整体清理/重建所有来源一次，不能在旧来源上叠加期初；固定资产 ref_type='1' 不受影响。

## 已执行检查与未验收项

- 已结束的 OA 局部 `mvn -o -DskipTests compile` 成功，560 个源码；日志 `cloudflow-backend/cloudflow-service-oa/target/oa08-final-compile.log`。在主线程要求停止 target 写入后未再运行 Maven。
- `scripts/oa-checks/run-consumable-checks.ps1`：222 条断言通过；读取现有依赖/class 快照，在系统临时目录补编译当前本项源码和测试，覆盖金额尾差/边界、DTO 拒注入、成本/大 ID 序列化、六个 Mapper 解析、重放/回滚、部分发料/退回/采购冲正、重算、冻结审批及跨租户回调。没有 Maven target 写入。
- `node scripts/oa-checks/consumable-contract-checks.mjs`：53 条客户端/DDL 契约断言通过；包括 sessionStorage 身份隔离、原请求冻结、采购超时重试、单复数 component、真实收货派生标识和处理器签名。无网络或数据库调用。
- 前端 `node_modules/.bin/tsc.cmd --noEmit --pretty false` 通过（包含采购核对组件）。测试源码为 `OaConsumableChecks.java`、`OaConsumableFlowChecks.java`；未新增测试框架或依赖。

内存 Mapper/事务替身不证明真实 MySQL 锁、唯一键竞争和事务原子性；尚未验收正式 323 表初始化、11 角色/双租户真实接口、实际工作流/Outbox/防自审链、规则中心、调度和消息投递、真实采购预算与来源项目、浏览器主题/交互。未执行服务启动期检查或全量构建；主线程结果须单独确认。

按新增授权编写 `scripts/verify-batch-h-oa.mjs` 真实接口套件，依赖 `scripts/batch-h/live-lib.mjs`，仅限 H 数据与 H 状态文件；在主线程明确通知前不执行。它不能用手写批准状态、实例或源流水替代真实业务过程，也不能把尚未运行的脚本记为验收通过。
