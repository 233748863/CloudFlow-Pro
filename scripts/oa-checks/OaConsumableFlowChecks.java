package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.AbstractWrapper;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.redis.core.SysConfigHelper;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.oa.domain.*;
import com.cloudflow.oa.domain.dto.*;
import com.cloudflow.oa.domain.vo.ConsumableResults;
import com.cloudflow.oa.domain.vo.OaIdentityReference;
import com.cloudflow.oa.mapper.*;
import com.cloudflow.oa.service.remote.RemoteConsumableRuleService;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import static com.cloudflow.oa.service.impl.OaConsumableChecks.*;

final class OaConsumableFlowChecks {
    static void run() throws Exception { postingAndRollback(); dispatchAndReturns(); purchaseReceipts(); verification(); approval(); }

    static void postingAndRollback() throws Exception {
        Fixture fixture = new Fixture(); fixture.material(11L); fixture.material(12L);
        fails(() -> fixture.ledger.lockAll(List.of(11L)), "inventory lock outside transaction rejected");
        fails(() -> fixture.ledger.persistBalance(fixture.materials.get(11L)), "cache write outside transaction rejected");
        fixture.transactions.execute(() -> { fixture.ledger.lockAll(List.of(12L, 11L)); return null; });
        equal(List.of(11L, 12L), fixture.lockOrder, "multi-material lock order is ascending");
        ConsumableCommands.Stock input = stock("posting-first", 3, "2.50");
        ConsumableResults.StockPosting first = fixture.inventory.inbound(11L, input);
        equal(3, fixture.materials.get(11L).getQuantity(), "inbound changes cache"); decimal("7.50", fixture.materials.get(11L).getStockAmount(), "inbound changes cost");
        equal(1, fixture.logs.size(), "one original asset log"); equal(1, fixture.rows.size(), "one immutable ledger row");
        equal(fixture.logs.get(0).getLogId(), fixture.rows.get(0).getAssetLogId(), "ledger links real log id"); equal("2", fixture.logs.get(0).getRefType(), "consumable log reference type");
        ConsumableResults.StockPosting repeated = fixture.inventory.inbound(11L, input); equal(true, repeated.isReplayed(), "immediate repeat replays"); equal(first.getLedgerIds(), repeated.getLedgerIds(), "repeat returns original ledger ids");
        equal(1, fixture.rows.size(), "repeat does not append ledger");
        input.setQuantity(4); fails(() -> fixture.inventory.inbound(11L, input), "same operation key different amount refused"); input.setQuantity(3);
        fixture.failLedgerInsert = true; fails(() -> fixture.inventory.inbound(11L, stock("posting-fail", 2, "1.00")), "ledger insertion failure rolls back original log"); fixture.failLedgerInsert = false;
        equal(1, fixture.logs.size(), "log rollback observed in transaction fixture"); equal(3, fixture.materials.get(11L).getQuantity(), "cache unchanged after ledger failure");
        fixture.failCacheUpdate = true; fails(() -> fixture.inventory.inbound(11L, stock("cache-fail", 1, "1.00")), "zero affected cache rows fail"); fixture.failCacheUpdate = false;
        equal(1, fixture.rows.size(), "cache failure rolls back ledger"); equal(1, fixture.logs.size(), "cache failure rolls back original log");
        identity(100001L, 2L); fails(() -> fixture.inventory.inbound(11L, stock("other-tenant", 1, "1.00")), "cross-tenant material refused"); identity(100000L, 2L);
        denied.add("oa:consumable-ledger:cost");
        ConsumableResults.StockPosting masked = fixture.inventory.inbound(11L, input); check(!json.readTree(json.writeValueAsString(masked)).path("rows").get(0).has("amount"), "replay applies current cost permission");
        ConsumableReadService reads = new ConsumableReadService(fixture.ledger, fixture.ledgerMapper, fixture.materialMapper, fixture.logMapper, scope -> true);
        check(reads.stock(11L).getStockAmount() == null, "master cost is server-masked"); denied.clear();
    }

    static void dispatchAndReturns() {
        Fixture fixture = new Fixture(); fixture.material(11L); fixture.material(12L); fixture.request(50L, 5, 3);
        fixture.inventory.inbound(11L, stock("issue-opening", 2, "5.00"));
        ConsumableCommands.Issue command = issue("issue-partial", 0, false, 5, 3);
        fails(() -> fixture.dispatch.issue(50L, command, null), "full batch fails on any shortage"); equal(1, fixture.rows.size(), "shortage writes no ledger");
        command.setAllowPartial(true); ConsumableResults.IssueResult result = fixture.dispatch.issue(50L, command, null);
        equal(2, result.getRows().get(0).getIssuedQuantity(), "partial first row uses available stock"); equal(0, result.getRows().get(1).getIssuedQuantity(), "partial result keeps zero-issued row");
        equal("APPROVED", fixture.requests.get(50L).getStatus(), "partial request remains approved"); decimal("10", fixture.requests.get(50L).getIssuedAmount(), "source request cost accumulated");
        fixture.inventory.inbound(12L, stock("issue-later-stock", 3, "2.00"));
        ConsumableResults.IssueResult replay = fixture.dispatch.issue(50L, command, null); equal(true, replay.isReplayed(), "partial operation replays after restock"); equal(0, replay.getRows().get(1).getIssuedQuantity(), "zero row is never reassigned by replay"); equal(3, fixture.materials.get(12L).getQuantity(), "replay leaves restocked second material untouched");
        denied.add("oa:consumable-request:issue"); fails(() -> fixture.dispatch.issue(50L, issue("denied", 1, true, 1, 1), null), "dispatch permission alone cannot issue"); denied.clear();
        ConsumableCommands.Issue zero = issue("zero", 1, true, 1, 0); zero.setItems(List.of(zero.getItems().get(0))); fails(() -> fixture.dispatch.issue(50L, zero, null), "all-zero actual allocation fails");
        fixture.inventory.inbound(11L, stock("issue-second-stock", 3, "4.00"));
        fixture.dispatch.issue(50L, issue("issue-rest", 1, false, 3, 3), null);
        equal("ISSUED", fixture.requests.get(50L).getStatus(), "complete allocation closes request"); decimal("28", fixture.requests.get(50L).getIssuedAmount(), "multi-material cumulative cost correct");
        Long originalId = Long.valueOf(result.getRows().get(0).getLedgerId());
        ConsumableCommands.ReturnStock returned = new ConsumableCommands.ReturnStock(); returned.setOperationKey("return-first"); returned.setRemark("实物已核验"); returned.setSourceLedgerId(originalId); returned.setQuantity(1); returned.setRequestVersion(2);
        ConsumableResults.StockPosting posting = fixture.dispatch.returnStock(11L, returned); equal(1, fixture.materials.get(11L).getQuantity(), "return adds physical stock"); decimal("5", fixture.materials.get(11L).getStockAmount(), "return uses original cost");
        equal(5, fixture.items.get(501L).getIssuedQuantity(), "return does not restore approved issue quota"); equal("ISSUED", fixture.requests.get(50L).getStatus(), "returned issued request remains issued");
        equal(posting.getLedgerIds(), fixture.dispatch.returnStock(11L, returned).getLedgerIds(), "return replay preserves original result");
        fails(() -> fixture.dispatch.issue(50L, issue("issue-after-return", 3, true, 1, 1), null), "returned quantity cannot be reissued against original approval");
        ConsumableCommands.Reverse reverse = reversal("reverse-return", 3); fixture.inventory.reverse(Long.valueOf(posting.getLedgerIds().get(0)), reverse);
        equal(0, fixture.items.get(501L).getReturnedQuantity(), "return reversal decreases source returned quantity"); decimal("0", fixture.requests.get(50L).getReturnedAmount(), "return reversal decreases source amount"); equal(0, fixture.materials.get(11L).getQuantity(), "return reversal removes physical stock");
        fails(() -> fixture.inventory.reverse(originalId, reversal("reverse-old", 4)), "nonlatest issue cannot reverse");
    }

    static void purchaseReceipts() {
        Fixture fixture = new Fixture(); fixture.material(11L); fixture.purchase();
        List<String> expected = List.of("3.33", "3.34", "3.33");
        for (int batch = 0; batch < 3; batch++) {
            PurchaseReceiptDTO command = receipt("purchase-" + batch, batch);
            ConsumableResults.StockPosting result = fixture.purchases.receive(70L, command);
            equal(expected.get(batch), result.getRows().get(0).getAmount(), "real receipt pipeline allocates batch " + batch);
            equal(true, fixture.purchases.receive(70L, command).isReplayed(), "receipt immediate replay " + batch);
        }
        equal(3, fixture.receipts.size(), "one source receipt per batch"); equal("RECEIVED", fixture.purchase.getStatus(), "purchase closes only after full receipt");
        decimal("10", fixture.materials.get(11L).getStockAmount(), "purchase total is exact");
        for (OaConsumableLedger row : fixture.rows) equal("PURCHASE_RECEIPT:" + row.getSourceBizId(), row.getSourceEventKey(), "source event uses actual receipt id");
        Long last = fixture.rows.get(fixture.rows.size() - 1).getLedgerId(); fixture.purchase.setPaymentRequestId(900L);
        ConsumableCommands.Reverse reverse = new ConsumableCommands.Reverse(); reverse.setOperationKey("reverse-receipt"); reverse.setRemark("撤销误收货"); reverse.setPurchaseVersion(3);
        fails(() -> fixture.inventory.reverse(last, reverse), "linked payment prevents receipt reversal"); fixture.purchase.setPaymentRequestId(null);
        fixture.inventory.reverse(last, reverse); equal(2, fixture.purchaseItem.getReceivedQuantity(), "receipt reversal updates received count"); equal("PARTIAL_RECEIVED", fixture.purchase.getStatus(), "receipt reversal reopens partial state"); decimal("6.67", fixture.materials.get(11L).getStockAmount(), "receipt reversal preserves allocation prefix");
        equal(true, fixture.inventory.reverse(last, reverse).isReplayed(), "receipt reversal replays"); equal(4, fixture.rows.size(), "repeated receipt reversal makes one inverse row");
    }

    static void verification() {
        Fixture fixture = new Fixture(); fixture.material(11L); fixture.inventory.inbound(11L, stock("verification", 3, "2.00"));
        ConsumableLedgerVerifier verifier = fixture.verifier(); SysConsumable material = fixture.materials.get(11L);
        equal(3, verifier.verify(material).quantity(), "full ledger verified"); material.setQuantity(1);
        ConsumableMaintenanceService maintenance = fixture.maintenance(verifier);
        ConsumableCommands.Recalculate command = new ConsumableCommands.Recalculate(); command.setOperationKey("check"); command.setRemark("核对"); command.setVersion(material.getVersion()); command.setMode("CHECK");
        ConsumableResults.Recalculation result = maintenance.recalculate(11L, command); equal(false, result.isConsistent(), "CHECK reports cache drift"); equal(1, fixture.materials.get(11L).getQuantity(), "CHECK does not repair stock");
        command.setOperationKey("rebuild"); command.setMode("REBUILD"); result = maintenance.recalculate(11L, command); equal(true, result.isChanged(), "REBUILD fixes materialized values"); equal(3, fixture.materials.get(11L).getQuantity(), "REBUILD follows actual ledger");
        int version = fixture.materials.get(11L).getVersion(); result = maintenance.recalculate(11L, command); equal(false, result.isChanged(), "same rebuild key returns changed=false"); equal(version, fixture.materials.get(11L).getVersion(), "rebuild repeat does not bump version"); equal(1, fixture.rows.size(), "rebuild never fabricates opening entries");
        fixture.logs.get(0).setQuantityChange(4); fails(() -> verifier.verify(fixture.materials.get(11L)), "source log drift rejected"); fixture.logs.get(0).setQuantityChange(3);
        fixture.rows.get(0).setSourceEventKey("fabricated-source"); fails(() -> verifier.verify(fixture.materials.get(11L)), "fabricated source event rejected");
    }

    static void approval() throws Exception {
        Fixture fixture = new Fixture(); fixture.material(11L); fixture.material(12L); fixture.request(50L, 5, 3);
        fixture.requests.get(50L).setStatus("DRAFT"); fixture.items.values().forEach(item -> item.setApprovedQuantity(0));
        Map<String, String> configValues = new HashMap<>(Map.of("sys.oa.consumable.approvalMode", "ALWAYS", "sys.oa.consumable.limitMetric", "AMOUNT", "sys.oa.consumable.approverUserId", "4"));
        SysConfigHelper config = new SysConfigHelper() { @Override public String getTenantValue(String key) { return configValues.get(key); } };
        BusinessRuleDTO rule = new BusinessRuleDTO(); rule.setRuleCode("oa.consumable.request.limit"); rule.setEnabled(1); rule.setThresholdValue(number("0.00")); rule.setEffect("WARN");
        RemoteConsumableRuleService remote = proxy(RemoteConsumableRuleService.class, (method, values) -> method.equals("getEffectiveRule") ? R.ok(rule) : R.ok());
        fixture.revision = Map.of("revisionId", 1L, "versionNo", 1, "thresholdValue", number("0.00"), "enabled", Boolean.TRUE, "effect", "WARN", "priority", 0);
        OaApprovalRequest submission = new OaApprovalRequest(); submission.setTenantId(100000L); submission.setBusinessId(50L); submission.setBusinessType("OA_CONSUMABLE_REQUEST"); submission.setStartUserId(3L); submission.setReservation("F:oa08-test");
        OaApprovalOutboxService outbox = new OaApprovalOutboxService(null, json, null, null) {
            @Override public String queue(String type, Long id, String businessNo, String processKey, Map<String, Object> variables) { submission.setVariables(new HashMap<>(variables)); submission.getVariables().put("oaRequestToken", submission.getReservation()); return submission.getReservation(); }
            @Override public OaApprovalRequest snapshot(ApprovalResultDTO result) { return submission; }
        };
        ConsumableApprovalService approvals = new ConsumableApprovalService(fixture.access, fixture.requestMapper, fixture.itemMapper, fixture.ledgerMapper, fixture.identities, fixture.ledger, fixture.transactions, fixture.operations, outbox, config, new ConsumableRuleExecutor(remote), json);
        ConsumableCommands.Submit command = new ConsumableCommands.Submit(); command.setOperationKey("submit-once"); command.setVersion(0);
        identity(100000L, 3L); configValues.put("sys.oa.consumable.approverUserId", "3"); fails(() -> approvals.submit(50L, command), "self approver configuration rejected"); configValues.put("sys.oa.consumable.approverUserId", "4");
        for (String invalid : List.of("disabled", "wrong-rule-code", "null-threshold", "negative-threshold", "null-effect", "unknown-effect", "fractional-quantity", "overflowing-quantity")) {
            rule.setRuleCode("oa.consumable.request.limit"); rule.setEnabled(1); rule.setThresholdValue(number("0.00")); rule.setEffect("WARN");
            configValues.put("sys.oa.consumable.limitMetric", invalid.endsWith("quantity") ? "QUANTITY" : "AMOUNT");
            switch (invalid) {
                case "disabled" -> rule.setEnabled(0);
                case "wrong-rule-code" -> rule.setRuleCode("H_INVALID_RULE");
                case "null-threshold" -> rule.setThresholdValue(null);
                case "negative-threshold" -> rule.setThresholdValue(number("-1"));
                case "null-effect" -> rule.setEffect(null);
                case "unknown-effect" -> rule.setEffect("H_INVALID_EFFECT");
                case "fractional-quantity" -> rule.setThresholdValue(number("1.50"));
                case "overflowing-quantity" -> rule.setThresholdValue(number("2147483648"));
                default -> throw new AssertionError("unexpected rule case");
            }
            try { approvals.submit(50L, command); throw new AssertionError("invalid rule accepted: " + invalid); }
            catch (IllegalArgumentException failure) {
                check(failure.getMessage().startsWith("RULE_INVALID:"), "invalid rule has stable business code: " + invalid);
                ResponseEntity<R<Object>> rejected = com.cloudflow.oa.controller.ConsumableExceptionHandler.rejection(failure);
                equal(400, rejected.getStatusCode().value(), "invalid rule returns 400: " + invalid);
                equal("RULE_INVALID: 领用规则未启用或配置无效，请联系管理员核对", rejected.getBody().getMsg(), "invalid rule uses fixed safe response: " + invalid);
            }
            equal("DRAFT", fixture.requests.get(50L).getStatus(), "invalid rule leaves draft unchanged: " + invalid);
            equal(0, fixture.requests.get(50L).getVersion(), "invalid rule leaves version unchanged: " + invalid);
            equal(0, fixture.rows.size(), "invalid rule writes no inventory: " + invalid);
            equal(0, fixture.logs.size(), "invalid rule writes no original log: " + invalid);
            equal(null, submission.getVariables(), "invalid rule does not queue workflow: " + invalid);
        }
        rule.setRuleCode("oa.consumable.request.limit"); rule.setEnabled(1); rule.setThresholdValue(number("0.00")); rule.setEffect("WARN");
        configValues.put("sys.oa.consumable.limitMetric", "AMOUNT");
        ConsumableResults.RequestResult submitted = approvals.submit(50L, command); equal(true, submitted.isApprovalPending(), "submission uses real outbox reservation");
        equal(List.of("3"), submission.getVariables().get("_hExcludedUserIds"), "original applicant frozen as string exclusion"); equal(List.of("4"), submission.getVariables().get("approverIds"), "only verified server approver frozen");
        String variables = json.writeValueAsString(submission.getVariables()); check(!variables.contains("Amount") && !variables.contains("unitPrice") && !variables.contains("thresholdValue"), "workflow variables do not disclose costs");
        configValues.remove("sys.oa.consumable.approverUserId"); equal(true, approvals.submit(50L, command).isReplayed(), "submitted request replays before reading changed configuration");
        ApprovalResultDTO result = new ApprovalResultDTO(); result.setTenantId(100000L); result.setBusinessType("OA_CONSUMABLE_REQUEST"); result.setBusinessId(50L); result.setProcessInstanceId("wf-oa08-test"); result.setApprovalResult("APPROVED"); result.setVariables(Map.of("oaRequestToken", "F:oa08-test")); result.setApproverId(4L);
        result.setTenantId(100001L); fails(() -> approvals.decision(result, true), "callback tenant cannot differ from execution tenant"); result.setTenantId(100000L);
        fails(() -> approvals.decision(result, true), "callback before reservation binding retries"); fixture.requests.get(50L).setInstanceId("wf-oa08-test"); result.setApproverId(3L);
        fails(() -> approvals.decision(result, true), "callback actual approver cannot be original applicant"); equal(0, fixture.items.get(501L).getApprovedQuantity(), "self approval changes no quantity"); result.setApproverId(4L);
        submission.getVariables().put("_hExcludedUserIds", List.of()); fails(() -> approvals.decision(result, true), "tampered frozen exclusion rejected"); submission.getVariables().put("_hExcludedUserIds", List.of("3"));
        approvals.decision(result, true); equal("APPROVED", fixture.requests.get(50L).getStatus(), "verified callback approves business"); equal(5, fixture.items.get(501L).getApprovedQuantity(), "approval sets source quantities"); equal(0, fixture.rows.size(), "approval never deducts inventory");
        int version = fixture.requests.get(50L).getVersion(); approvals.decision(result, true); equal(version, fixture.requests.get(50L).getVersion(), "duplicate callback is a no-op");
        result.setProcessInstanceId("old-instance"); approvals.decision(result, true); equal(version, fixture.requests.get(50L).getVersion(), "old instance cannot progress business"); identity(100000L, 2L);
    }

    static ConsumableCommands.Stock stock(String key, int quantity, String price) { ConsumableCommands.Stock command = new ConsumableCommands.Stock(); command.setOperationKey(key); command.setQuantity(quantity); command.setUnitPrice(number(price)); command.setRemark("OA08内存校验"); return command; }
    static ConsumableCommands.Reverse reversal(String key, int version) { ConsumableCommands.Reverse command = new ConsumableCommands.Reverse(); command.setOperationKey(key); command.setRemark("冲正核对"); command.setRequestVersion(version); return command; }
    static ConsumableCommands.Issue issue(String key, int version, boolean partial, int first, int second) { ConsumableCommands.Issue command = new ConsumableCommands.Issue(); command.setOperationKey(key); command.setRemark("发料核对"); command.setVersion(version); command.setAllowPartial(partial); ConsumableCommands.IssueLine one = new ConsumableCommands.IssueLine(); one.setItemId(501L); one.setQuantity(first); ConsumableCommands.IssueLine two = new ConsumableCommands.IssueLine(); two.setItemId(502L); two.setQuantity(second); command.setItems(List.of(one, two)); return command; }
    static PurchaseReceiptDTO receipt(String key, int version) { PurchaseReceiptDTO command = new PurchaseReceiptDTO(); command.setOperationKey(key); command.setPurchaseVersion(version); command.setRemark("receipt-check"); PurchaseReceiptDTO.PurchaseReceiptItemDTO item = new PurchaseReceiptDTO.PurchaseReceiptItemDTO(); item.setItemId(701L); item.setQuantity(1); command.setItems(List.of(item)); return command; }

    static final class Fixture {
        Map<Long, SysConsumable> materials = new LinkedHashMap<>();
        Map<Long, OaConsumableRequest> requests = new LinkedHashMap<>();
        Map<Long, OaConsumableRequestItem> items = new LinkedHashMap<>();
        List<OaConsumableLedger> rows = new ArrayList<>();
        List<SysAssetLog> logs = new ArrayList<>();
        List<OaTraceEvent> traces = new ArrayList<>();
        List<BizPurchaseReceipt> receipts = new ArrayList<>();
        List<Long> lockOrder = new ArrayList<>();
        BizPurchaseRequest purchase;
        BizPurchaseItem purchaseItem;
        Map<String, Object> revision;
        boolean failLedgerInsert;
        boolean failCacheUpdate;
        long ledgerSequence;
        long logSequence;
        long traceSequence;
        long receiptSequence;

        final SysConsumableMapper materialMapper = proxy(SysConsumableMapper.class, (method, arguments) -> switch (method) {
            case "selectForUpdate" -> { Long id = (Long) arguments[1]; lockOrder.add(id); yield materials.get(id); }
            case "selectOne" -> materials.get(wrapperId(arguments[0]));
            case "updateBalance" -> failCacheUpdate ? 0 : 1;
            case "closeRecoveredRisks" -> 0;
            case "batchIds" -> materials.keySet().stream().filter(id -> id > (Long) arguments[1]).sorted().limit(100).toList();
            default -> throw new AssertionError("unexpected material call " + method);
        });
        final SysAssetLogMapper logMapper = proxy(SysAssetLogMapper.class, (method, arguments) -> switch (method) {
            case "insert" -> { SysAssetLog log = (SysAssetLog) arguments[0]; log.setLogId(++logSequence); logs.add(log); yield 1; }
            case "selectById" -> logs.stream().filter(row -> row.getLogId().equals(arguments[0])).findFirst().orElse(null);
            default -> throw new AssertionError("unexpected log call " + method);
        });
        final OaConsumableLedgerMapper ledgerMapper = proxy(OaConsumableLedgerMapper.class, (method, arguments) -> switch (method) {
            case "insert" -> {
                if (failLedgerInsert) throw new IllegalStateException("injected ledger failure");
                OaConsumableLedger row = (OaConsumableLedger) arguments[0];
                if (rows.stream().anyMatch(prior -> prior.getSourceEventKey().equals(row.getSourceEventKey()) || prior.getOperationKey().equals(row.getOperationKey()) && prior.getOperationLineNo().equals(row.getOperationLineNo()))) throw new DuplicateKeyException("fixture unique operation/source");
                row.setLedgerId(++ledgerSequence); rows.add(row); yield 1;
            }
            case "selectOne" -> rows.stream().filter(row -> row.getLedgerId().equals(wrapperId(arguments[0]))).findFirst().orElse(null);
            case "tail" -> rows.stream().filter(row -> row.getConsumableId().equals(arguments[1])).max(Comparator.comparing(OaConsumableLedger::getLedgerId)).orElse(null);
            case "operation" -> rows.stream().filter(row -> row.getTenantId().equals(arguments[0]) && row.getOperationKey().equals(arguments[1])).sorted(Comparator.comparing(OaConsumableLedger::getOperationLineNo)).toList();
            case "reversal" -> rows.stream().filter(row -> Objects.equals(row.getReversalOfLedgerId(), arguments[1])).findFirst().orElse(null);
            case "returns" -> rows.stream().filter(row -> Objects.equals(row.getSourceLedgerId(), arguments[1]) && "RETURN".equals(row.getTransactionType())).toList();
            case "requestRows" -> rows.stream().filter(row -> "CONSUMABLE_REQUEST".equals(row.getSourceBizType()) && Objects.equals(row.getSourceBizId(), arguments[1])).toList();
            case "chain" -> rows.stream().filter(row -> row.getConsumableId().equals(arguments[1]) && row.getLedgerId() > (Long) arguments[2]).sorted(Comparator.comparing(OaConsumableLedger::getLedgerId)).limit(100).toList();
            case "lastInbound" -> rows.stream().filter(row -> row.getConsumableId().equals(arguments[1]) && row.getQuantity() > 0 && row.getReversalOfLedgerId() == null && ("INBOUND".equals(row.getTransactionType()) || "ADJUST".equals(row.getTransactionType()))).max(Comparator.comparing(OaConsumableLedger::getLedgerId)).orElse(null);
            case "receivedQuantity" -> rows.stream().filter(row -> "PURCHASE_RECEIPT".equals(row.getSourceBizType()) && row.getSourceItemId().equals(arguments[1])).mapToLong(OaConsumableLedger::getQuantity).sum();
            case "receivedAmount" -> rows.stream().filter(row -> "PURCHASE_RECEIPT".equals(row.getSourceBizType()) && row.getSourceItemId().equals(arguments[1])).map(OaConsumableLedger::getAmount).reduce(number("0.00"), BigDecimal::add);
            case "lastPurchasePrice" -> rows.stream().filter(row -> row.getConsumableId().equals(arguments[1]) && "PURCHASE_RECEIPT".equals(row.getSourceBizType()) && row.getReversalOfLedgerId() == null && rows.stream().noneMatch(reversal -> Objects.equals(reversal.getReversalOfLedgerId(), row.getLedgerId()))).max(Comparator.comparing(OaConsumableLedger::getLedgerId)).map(OaConsumableLedger::getUnitPrice).orElse(null);
            default -> throw new AssertionError("unexpected ledger call " + method);
        });
        final OaIdentityReferenceMapper identities = proxy(OaIdentityReferenceMapper.class, (method, arguments) -> {
            OaIdentityReference account = new OaIdentityReference(); account.setTenantId(100000L); account.setId((Long) arguments[0]); account.setName("test-user-" + arguments[0]); account.setDeptId(100L); account.setDeptName("test-department"); return account;
        });
        final OaConsumableRequestMapper requestMapper = proxy(OaConsumableRequestMapper.class, (method, arguments) -> switch (method) {
            case "selectOne" -> requests.get(wrapperId(arguments[0]));
            case "lock", "visible" -> requests.get(arguments[1]);
            case "saveState" -> 1;
            case "approverAllowed" -> 1;
            case "ruleVersion" -> revision;
            case "operationTrace" -> traces.stream().filter(row -> row.getTenantId().equals(arguments[0]) && "OA_CONSUMABLE_REQUEST".equals(row.getBusinessType()) && (arguments[1] == null || row.getBusinessId().equals(arguments[1])) && row.getEventType().equals(arguments[2]) && row.getEventContent().equals(arguments[3])).reduce((first, second) -> second).orElse(null);
            default -> throw new AssertionError("unexpected request call " + method);
        });
        final OaConsumableRequestItemMapper itemMapper = proxy(OaConsumableRequestItemMapper.class, (method, arguments) -> switch (method) {
            case "items", "lockItems" -> items.values().stream().filter(item -> item.getRequestId().equals(arguments[1])).toList();
            case "selectById" -> items.get(arguments[0]);
            case "saveState" -> 1;
            default -> throw new AssertionError("unexpected request item call " + method);
        });
        final OaTraceEventMapper traceMapper = proxy(OaTraceEventMapper.class, (method, arguments) -> {
            if (!method.equals("insert")) throw new AssertionError("unexpected trace call " + method);
            OaTraceEvent trace = (OaTraceEvent) arguments[0]; trace.setId(++traceSequence); traces.add(trace); return 1;
        });
        final BizPurchaseRequestMapper purchaseMapper = proxy(BizPurchaseRequestMapper.class, (method, arguments) -> switch (method) {
            case "selectOne" -> purchase;
            case "updateById" -> { purchase = (BizPurchaseRequest) arguments[0]; purchase.setVersion(purchase.getVersion() + 1); yield 1; }
            default -> throw new AssertionError("unexpected purchase call " + method);
        });
        final BizPurchaseReceiptMapper receiptMapper = proxy(BizPurchaseReceiptMapper.class, (method, arguments) -> switch (method) {
            case "insert" -> { BizPurchaseReceipt receipt = (BizPurchaseReceipt) arguments[0]; receipt.setId(++receiptSequence); receipts.add(receipt); yield 1; }
            case "selectOne" -> receipts.stream().filter(receipt -> receipt.getId().equals(wrapperId(arguments[0]))).findFirst().orElse(null);
            case "selectById" -> receipts.stream().filter(receipt -> receipt.getId().equals(arguments[0])).findFirst().orElse(null);
            default -> throw new AssertionError("unexpected receipt call " + method);
        });
        final OaConsumablePurchaseMapper purchaseLines = proxy(OaConsumablePurchaseMapper.class, (method, arguments) -> switch (method) {
            case "lockItems" -> List.of(purchaseItem);
            case "updateReceived" -> 1;
            default -> throw new AssertionError("unexpected purchase line call " + method);
        });
        final OaConsumableMaintenanceMapper maintenanceMapper = proxy(OaConsumableMaintenanceMapper.class, (method, arguments) -> switch (method) {
            case "sourceDrift" -> 0;
            case "recalculationTrace" -> traces.stream().filter(trace -> trace.getBusinessType().equals("CONSUMABLE") && trace.getBusinessId().equals(arguments[1]) && trace.getEventType().equals("CONSUMABLE_RECALCULATE_REQUEST") && trace.getEventContent().equals(arguments[2])).reduce((first, second) -> second).orElse(null);
            default -> throw new AssertionError("unexpected maintenance call " + method);
        });
        final ConsumableLedgerService ledger = new ConsumableLedgerService(materialMapper, ledgerMapper, logMapper, identities);
        final ConsumableRequestAccess access = new ConsumableRequestAccess(requestMapper, itemMapper);
        final ConsumableOperationSupport operations = new ConsumableOperationSupport(json, requestMapper, traceMapper);
        final ConsumableTransactions transactions = new ConsumableTransactions(new AbstractPlatformTransactionManager() {
            @Override protected Object doGetTransaction() { return new MemoryTransaction(); }
            @Override protected void doBegin(Object transaction, TransactionDefinition definition) { equal(TransactionDefinition.ISOLATION_READ_COMMITTED, definition.getIsolationLevel(), "stock transaction uses READ_COMMITTED"); ((MemoryTransaction) transaction).snapshot = snapshot(); }
            @Override protected void doCommit(DefaultTransactionStatus status) { }
            @Override protected void doRollback(DefaultTransactionStatus status) { restore(((MemoryTransaction) status.getTransaction()).snapshot); }
        });
        final ConsumableDispatchService dispatch = new ConsumableDispatchService(access, itemMapper, ledgerMapper, ledger, transactions, operations);
        final ConsumablePurchaseService purchases = new ConsumablePurchaseService(purchaseMapper, receiptMapper, purchaseLines, ledgerMapper,
                new OaRfqPurchaseSourceService(null, null, null, null, null, null) { @Override public BizPurchaseRequest lockForWrite(Long id, Long rfqId) { return purchase; } }, null, ledger, operations, transactions);
        final ConsumableInventoryService inventory = new ConsumableInventoryService(ledger, transactions, operations, dispatch, purchases);

        void material(Long id) {
            SysConsumable material = new SysConsumable(); material.setConsumableId(id); material.setTenantId(100000L); material.setDeleted(0); material.setVersion(0); material.setName("OA08-test-" + id); material.setUnit("件"); material.setQuantity(0); material.setStockAmount(number("0.00")); material.setAvgCost(number("0.00")); material.setStatus("ACTIVE"); material.setLowStockThreshold(1); material.setWarnEnabled(1); materials.put(id, material);
        }

        void request(Long id, int first, int second) {
            OaConsumableRequest request = new OaConsumableRequest(); request.setRequestId(id); request.setTenantId(100000L); request.setDeleted(0); request.setVersion(0); request.setRequestNo("TEST-" + id); request.setApplicantId(3L); request.setApplicantName("test-applicant"); request.setDeptId(100L); request.setDeptName("test-department"); request.setPurpose("内存验证"); request.setApplyDate(LocalDate.now()); request.setStatus("APPROVED"); request.setIssuedAmount(number("0.00")); request.setReturnedAmount(number("0.00")); requests.put(id, request);
            for (int index = 0; index < 2; index++) {
                OaConsumableRequestItem item = new OaConsumableRequestItem(); item.setItemId(501L + index); item.setTenantId(100000L); item.setRequestId(id); item.setConsumableId(11L + index); item.setConsumableName("test-material-" + index); item.setUnit("件"); item.setApplyQuantity(index == 0 ? first : second); item.setApprovedQuantity(item.getApplyQuantity()); item.setIssuedQuantity(0); item.setReturnedQuantity(0); item.setIssuedAmount(number("0.00")); item.setReturnedAmount(number("0.00")); item.setVersion(0); items.put(item.getItemId(), item);
            }
        }

        void purchase() {
            purchase = new BizPurchaseRequest(); purchase.setId(70L); purchase.setTenantId(100000L); purchase.setDeleted(0); purchase.setVersion(0); purchase.setUserId(2L); purchase.setPurchaseNo("PURCHASE-TEST"); purchase.setStatus("APPROVED"); purchase.setPaymentStatus("NONE"); purchase.setTotalAmount(number("10.00"));
            purchaseItem = new BizPurchaseItem(); purchaseItem.setId(701L); purchaseItem.setTenantId(100000L); purchaseItem.setPurchaseId(70L); purchaseItem.setConsumableId(11L); purchaseItem.setConsumableName("test-consumable"); purchaseItem.setUnit("件"); purchaseItem.setQuantity(3); purchaseItem.setUnitPrice(number("3.33")); purchaseItem.setAmount(number("10.00")); purchaseItem.setReceivedQuantity(0);
        }

        ConsumableLedgerVerifier verifier() { return new ConsumableLedgerVerifier(ledgerMapper, logMapper, proxy(BizPurchaseItemMapper.class, (method, values) -> purchaseItem), receiptMapper, itemMapper, maintenanceMapper, access, ledger); }
        ConsumableMaintenanceService maintenance(ConsumableLedgerVerifier verifier) { return new ConsumableMaintenanceService(ledger, verifier, transactions, operations, maintenanceMapper, materialMapper, null, identities, null, null, json); }

        record Snapshot(Map<Long, SysConsumable> materials, Map<Long, OaConsumableRequest> requests, Map<Long, OaConsumableRequestItem> items,
                        List<OaConsumableLedger> rows, List<SysAssetLog> logs, List<OaTraceEvent> traces, List<BizPurchaseReceipt> receipts, BizPurchaseRequest purchase, BizPurchaseItem purchaseItem) { }
        static final class MemoryTransaction { Snapshot snapshot; }
        Snapshot snapshot() { return new Snapshot(copyMap(materials), copyMap(requests), copyMap(items), copyList(rows), copyList(logs), copyList(traces), copyList(receipts), copy(purchase), copy(purchaseItem)); }
        void restore(Snapshot snapshot) { materials = snapshot.materials(); requests = snapshot.requests(); items = snapshot.items(); rows = snapshot.rows(); logs = snapshot.logs(); traces = snapshot.traces(); receipts = snapshot.receipts(); purchase = snapshot.purchase(); purchaseItem = snapshot.purchaseItem(); }
        static <Entity> Map<Long, Entity> copyMap(Map<Long, Entity> values) { Map<Long, Entity> result = new LinkedHashMap<>(); values.forEach((id, entity) -> result.put(id, copy(entity))); return result; }
        static <Entity> List<Entity> copyList(List<Entity> values) { return new ArrayList<>(values.stream().map(OaConsumableChecks::copy).toList()); }
        static Long wrapperId(Object value) { AbstractWrapper<?, ?, ? extends AbstractWrapper<?, ?, ?>> wrapper = (AbstractWrapper<?, ?, ?>) value; wrapper.getSqlSegment(); return (Long) wrapper.getParamNameValuePairs().get("MPGENVAL2"); }
    }
}
