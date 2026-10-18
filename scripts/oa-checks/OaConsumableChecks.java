package com.cloudflow.oa.service.impl;

import cn.dev33.satoken.stp.StpLogic;
import cn.dev33.satoken.stp.StpUtil;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.oa.controller.ConsumableController;
import com.cloudflow.oa.controller.ConsumableExceptionHandler;
import com.cloudflow.oa.controller.ConsumableLedgerController;
import com.cloudflow.oa.controller.ConsumableRequestController;
import com.cloudflow.oa.controller.PurchaseRequestController;
import com.cloudflow.oa.domain.*;
import com.cloudflow.oa.domain.dto.*;
import com.cloudflow.oa.domain.vo.ConsumableResults;
import com.cloudflow.oa.service.IPurchaseRequestService;
import com.cloudflow.oa.service.remote.RemoteConsumableRuleService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import java.io.InputStream;
import java.lang.reflect.Method;
import java.util.concurrent.atomic.AtomicReference;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.apache.ibatis.builder.xml.XMLMapperBuilder;
import org.springframework.beans.BeanUtils;
import java.lang.reflect.Proxy;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.BiFunction;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestControllerAdvice;

public final class OaConsumableChecks {
    static final AtomicInteger assertions = new AtomicInteger();
    static final ObjectMapper json = new ObjectMapper().registerModule(new JavaTimeModule());
    static final java.util.HashSet<String> denied = new java.util.HashSet<>();

    public static void main(String[] arguments) throws Exception {
        StpLogic original = StpUtil.getStpLogic();
        StpUtil.setStpLogic(new StpLogic("oa08-check") {
            @Override public boolean hasPermission(String permission) { return !denied.contains(permission); }
            @Override public void checkPermission(String permission) { if (!hasPermission(permission)) throw new IllegalArgumentException("permission denied: " + permission); }
            @Override public void checkPermissionAnd(String... permissions) { Arrays.stream(permissions).forEach(this::checkPermission); }
        });
        identity(100000L, 2L);
        for (Class<?> entity : List.of(SysConsumable.class, SysAssetLog.class, OaConsumableLedger.class, OaConsumableRequest.class,
                OaConsumableRequestItem.class, OaTraceEvent.class, BizPurchaseReceipt.class, BizPurchaseItem.class, BizPurchaseRequest.class)) {
            TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), "oa08-check"), entity);
        }
        try {
            costs(); inputs(); rules(); ruleRemoteContracts(); privacy(); mapperContracts(); endpointContracts(); errorContracts();
            OaConsumableFlowChecks.run();
        } finally { denied.clear(); StpUtil.setStpLogic(original); TenantContext.clear(); UserContext.clear(); }
        System.out.println("PASS: " + assertions.get() + " OA-08 assertions; no database/service writes");
    }

    static void errorContracts() {
        ConsumableExceptionHandler handler = new ConsumableExceptionHandler();
        Map<String, String> expectedMessages = Map.ofEntries(
                Map.entry("IDEMPOTENCY_CONFLICT", "请求键已用于其他业务内容或操作人，请核对原请求"),
                Map.entry("VERSION_CONFLICT", "数据已变更，请刷新后重试"),
                Map.entry("STOCK_NOT_ENOUGH", "库存或剩余批准数量不足，本次未记账"),
                Map.entry("RULE_BLOCKED", "领用申请不符合已配置的规则"),
                Map.entry("RULE_INVALID", "领用规则未启用或配置无效，请联系管理员核对"),
                Map.entry("RULE_CHANGED", "审批规则已变更，请刷新后重试"),
                Map.entry("SELF_APPROVAL_FORBIDDEN", "原申请人不能审批自己的领用申请"),
                Map.entry("AMOUNT_OUT_OF_RANGE", "金额超出允许范围或精度"),
                Map.entry("QUANTITY_OUT_OF_RANGE", "数量超出允许范围"),
                Map.entry("LEDGER_INCONSISTENT", "库存台账校验不通过，请联系管理员核对"),
                Map.entry("REVERSAL_NOT_ALLOWED", "当前台账不符合冲正条件"));
        for (Map.Entry<String, String> entry : expectedMessages.entrySet()) {
            ResponseEntity<R<Void>> response = handler.invalidCommand(new IllegalArgumentException(entry.getKey() + ": H_SENSITIVE_BODY_DO_NOT_ECHO"));
            int expectedStatus = Set.of("IDEMPOTENCY_CONFLICT", "VERSION_CONFLICT", "STOCK_NOT_ENOUGH").contains(entry.getKey()) ? 409 : 400;
            equal(expectedStatus, response.getStatusCode().value(), "consumable rejection HTTP status");
            equal(expectedStatus, response.getBody().getCode(), "consumable rejection business status");
            equal(entry.getKey() + ": " + entry.getValue(), response.getBody().getMsg(), "only fixed whitelist text is returned");
            purchaseRejection(new IllegalArgumentException(entry.getKey() + ": H_SENSITIVE_BODY_DO_NOT_ECHO"), expectedStatus, response.getBody().getMsg());
        }
        for (IllegalArgumentException exception : List.of(new IllegalArgumentException(), new IllegalArgumentException(""),
                new IllegalArgumentException("   "), new IllegalArgumentException("UNKNOWN: H_SENSITIVE_BODY_DO_NOT_ECHO"),
                new NumberFormatException("For input string: \"H_SENSITIVE_BODY_DO_NOT_ECHO\""),
                new IllegalArgumentException("STOCK_NOT_ENOUGH_EXTRA: H_SENSITIVE_BODY_DO_NOT_ECHO"),
                new IllegalArgumentException("VERSION_CONFLICT\n: H_SENSITIVE_BODY_DO_NOT_ECHO"))) {
            ResponseEntity<R<Void>> response = handler.invalidCommand(exception);
            equal(400, response.getStatusCode().value(), "unrecognized rejection HTTP status");
            equal(400, response.getBody().getCode(), "unrecognized rejection business status");
            equal("INVALID_PARAMETER: 耗材业务参数无效，请核对后重试", response.getBody().getMsg(), "uncontrolled exception text is never echoed");
            purchaseRejection(exception, 400, response.getBody().getMsg());
        }
        RestControllerAdvice scope = ConsumableExceptionHandler.class.getAnnotation(org.springframework.web.bind.annotation.RestControllerAdvice.class);
        equal(Set.of(ConsumableController.class, ConsumableLedgerController.class, ConsumableRequestController.class),
                Set.of(scope.assignableTypes()), "handler does not change unrelated OA controllers");
    }

    static void purchaseRejection(IllegalArgumentException failure, int expectedStatus, String expectedMessage) {
        Class<IPurchaseRequestService> contract = com.cloudflow.oa.service.IPurchaseRequestService.class;
        IPurchaseRequestService service = (com.cloudflow.oa.service.IPurchaseRequestService) java.lang.reflect.Proxy.newProxyInstance(
                contract.getClassLoader(), new Class<?>[]{contract}, (proxy, method, arguments) -> {
                    if ("receivePurchase".equals(method.getName())) throw failure;
                    throw new UnsupportedOperationException();
                });
        PurchaseRequestController controller = new PurchaseRequestController(service, null);
        ResponseEntity<R<ConsumableResults.StockPosting>> response = controller.receipt(1L, new com.cloudflow.oa.domain.dto.PurchaseReceiptDTO());
        equal(expectedStatus, response.getStatusCode().value(), "purchase receipt rejection HTTP status");
        equal(expectedStatus, response.getBody().getCode(), "purchase receipt rejection business status");
        equal(expectedMessage, response.getBody().getMsg(), "purchase receipt uses fixed safe error messages");
    }

    static void costs() {
        ConsumableCostCalculator.Balance calculator = ConsumableCostCalculator.apply(0, number("0"), 3, number("10"));
        decimal("3.33", calculator.average(), "moving average uses HALF_UP");
        BigDecimal received = number("0");
        String[] expected = {"3.33", "3.34", "3.33"};
        for (int cumulative = 1; cumulative <= 3; cumulative++) {
            BigDecimal allocated = ConsumableCostCalculator.allocate(number("10"), 3, cumulative, received);
            decimal(expected[cumulative - 1], allocated, "receipt allocation " + cumulative);
            received = received.add(allocated);
        }
        decimal("10", received, "receipts exactly equal approved source amount");
        decimal("6.67", ConsumableCostCalculator.outbound(3, number("10"), 2), "weighted outbound amount");
        ConsumableCostCalculator.Balance remaining = ConsumableCostCalculator.apply(3, number("10"), -2, number("-6.67"));
        decimal("3.33", remaining.amount(), "outbound remainder");
        ConsumableCostCalculator.Balance exhausted = ConsumableCostCalculator.apply(1, remaining.amount(), -1, ConsumableCostCalculator.outbound(1, remaining.amount(), 1).negate());
        equal(0, exhausted.quantity(), "quantity exhausted"); decimal("0.00", exhausted.amount(), "exhaustion removes final cent");
        decimal("0.00", exhausted.average(), "empty average is zero");
        equal(Integer.MAX_VALUE, ConsumableCostCalculator.apply(0, number("0"), Integer.MAX_VALUE, number("0")).quantity(), "maximum integer quantity accepted");
        fails(() -> ConsumableCostCalculator.apply(Integer.MAX_VALUE, number("0"), 1, number("0")), "quantity overflow refused");
        fails(() -> ConsumableCostCalculator.apply(1, number("1"), -2, number("-1")), "negative stock refused");
        fails(() -> ConsumableCostCalculator.apply(1, number("1"), -1, number("0")), "nonzero cost on exhaustion refused");
        fails(() -> ConsumableCostCalculator.apply(1, number("1"), 1, number("-1")), "cost direction mismatch refused");
        fails(() -> ConsumableCostCalculator.price(number("100000000")), "money upper bound enforced");
        fails(() -> ConsumableCostCalculator.price(number("0.001")), "excess money precision refused");
        fails(() -> ConsumableCostCalculator.positive(0), "zero movement refused");
        fails(() -> ConsumableCostCalculator.allocate(number("10"), 3, 4, number("10")), "over-return or over-receipt refused");
        decimal("0.00", ConsumableCostCalculator.outbound(5, number("0"), 4), "explicit free stock allowed");
    }

    static void inputs() throws Exception {
        String stock = "{\"operationKey\":\"dto-stock\",\"quantity\":1,\"unitPrice\":\"1\",\"remark\":\"test\"}";
        ConsumableCommands.Stock parsed = json.readValue(stock, ConsumableCommands.Stock.class);
        decimal("1.00", parsed.getUnitPrice(), "money text is normalized");
        for (String quantity : List.of("1.5", "\"1\"", "2147483648", "true")) {
            fails(() -> json.readValue(stock.replace("\"quantity\":1", "\"quantity\":" + quantity), ConsumableCommands.Stock.class), "strict integer input " + quantity);
        }
        for (String price : List.of("1.25", "\"1.001\"", "\"-1\"", "\"1e2\"", "\"100000000\"")) {
            fails(() -> json.readValue(stock.replace("\"unitPrice\":\"1\"", "\"unitPrice\":" + price), ConsumableCommands.Stock.class), "strict money text " + price);
        }
        for (String field : List.of("tenantId", "operatorId", "stockAmount", "avgCost", "status", "approvedQuantity", "instanceId")) {
            fails(() -> json.readValue(stock.substring(0, stock.length() - 1) + ",\"" + field + "\":1}", ConsumableCommands.Stock.class), "server-owned field rejected " + field);
        }
        fails(() -> json.readValue("{\"items\":[{\"itemId\":1,\"quantity\":1,\"unitPrice\":\"1.00\"}]}", PurchaseReceiptDTO.class), "receipt cannot inject source price");
        fails(() -> ConsumableOperationSupport.key("invalid key"), "operation key alphabet enforced");
        fails(() -> ConsumableOperationSupport.key("a".repeat(65)), "operation key length enforced");
        ConsumableOperationSupport operations = new ConsumableOperationSupport(json, null, null);
        ConsumableCommands.Stock second = json.readValue(stock.replace("\"1\"", "\"1.00\""), ConsumableCommands.Stock.class);
        equal(operations.hash("INBOUND", 1L, parsed), operations.hash("INBOUND", 1L, second), "normalized money gives stable hash");
        check(!operations.hash("INBOUND", 1L, parsed).equals(operations.hash("ADJUST", 1L, parsed)), "hash includes entry point");
        String first = operations.hash("INBOUND", 1L, parsed);
        identity(100000L, 3L); check(!first.equals(operations.hash("INBOUND", 1L, parsed)), "hash includes actual operator"); identity(100000L, 2L);
        ConsumableQuery query = new ConsumableQuery(); query.setPageSize(101);
        fails(() -> ConsumableOperationSupport.query(query, false), "maximum page size is 100");
    }

    static void rules() {
        BusinessRuleDTO rule = new BusinessRuleDTO(); rule.setThresholdValue(number("10")); rule.setEffect("WARN");
        equal(false, ConsumableRuleExecutor.decide(rule, "THRESHOLD", number("10"), number("10")).approval(), "equal threshold is not exceeded");
        equal(true, ConsumableRuleExecutor.decide(rule, "THRESHOLD", number("10.01"), number("10.01")).approval(), "exceeded warning needs approval");
        equal(true, ConsumableRuleExecutor.decide(rule, "THRESHOLD", null, null).approval(), "unknown amount always approves through workflow");
        rule.setEffect("PASS"); equal(true, ConsumableRuleExecutor.decide(rule, "ALWAYS", number("20"), number("20")).approval(), "PASS does not bypass ALWAYS");
        equal(false, ConsumableRuleExecutor.decide(rule, "THRESHOLD", number("20"), number("20")).approval(), "explicit PASS may auto-approve threshold mode");
        rule.setEffect("BLOCK"); equal("BLOCK", ConsumableRuleExecutor.decide(rule, "ALWAYS", number("20"), number("20")).effect(), "BLOCK retained for rejection");
    }

    static void ruleRemoteContracts() throws Exception {
        Class<RemoteConsumableRuleService> client = RemoteConsumableRuleService.class;
        FeignClient annotation = client.getAnnotation(org.springframework.cloud.openfeign.FeignClient.class);
        equal(void.class, annotation.fallback(), "consumable rules do not inherit success fallback");
        equal(void.class, annotation.fallbackFactory(), "consumable rules do not inherit fallback factory");
        equal("/inner/auth/oa-consumable-rules/effective/{ruleCode}", client.getMethod("getEffectiveRule", String.class)
                .getAnnotation(org.springframework.web.bind.annotation.GetMapping.class).value()[0], "rule reads use restricted internal route");
        equal("/inner/auth/oa-consumable-rules/hit-records", client.getMethod("recordHit", BusinessRuleHitRecordDTO.class)
                .getAnnotation(org.springframework.web.bind.annotation.PostMapping.class).value()[0], "rule hits use restricted internal route");
        BusinessRuleDTO rule = new BusinessRuleDTO(); rule.setRuleCode("oa.consumable.request.limit"); rule.setThresholdValue(number("10"));
        AtomicReference<BusinessRuleHitRecordDTO> record = new java.util.concurrent.atomic.AtomicReference<BusinessRuleHitRecordDTO>();
        ConsumableRuleExecutor available = new ConsumableRuleExecutor(proxy(client, (method, values) -> {
            if (method.equals("getEffectiveRule")) return com.cloudflow.common.core.domain.R.ok(rule);
            record.set((BusinessRuleHitRecordDTO) values[0]);
            return com.cloudflow.common.core.domain.R.ok();
        }));
        equal(rule, available.effective(rule.getRuleCode()), "effective internal rule returned unchanged");
        available.record(50L, rule, null, "WARN");
        equal(null, record.get().getActualValue(), "unknown estimate is not rewritten as zero");
        equal(100000L, record.get().getTenantId(), "rule hit tenant comes from business context");
        equal("OA_CONSUMABLE_REQUEST", record.get().getBusinessType(), "rule hit uses exact consumable business type");
        ConsumableRuleExecutor rejected = new ConsumableRuleExecutor(proxy(client, (method, values) -> com.cloudflow.common.core.domain.R.fail("rejected")));
        fails(() -> rejected.effective(rule.getRuleCode()), "failed rule response blocks submit");
        fails(() -> rejected.record(50L, rule, number("11"), "WARN"), "failed hit response blocks submit");
        ConsumableRuleExecutor absent = new ConsumableRuleExecutor(proxy(client, (method, values) -> null));
        fails(() -> absent.effective(rule.getRuleCode()), "absent rule response blocks submit");
        fails(() -> absent.record(50L, rule, number("11"), "WARN"), "absent hit response blocks submit");
        ConsumableRuleExecutor broken = new ConsumableRuleExecutor(proxy(client, (method, values) -> { throw new IllegalStateException("H_SENSITIVE_REMOTE_BODY"); }));
        for (String method : List.of("effective", "record")) {
            try {
                if (method.equals("effective")) broken.effective(rule.getRuleCode()); else broken.record(50L, rule, number("11"), "WARN");
                throw new AssertionError("remote transport failure unexpectedly accepted");
            } catch (IllegalStateException failure) {
                equal(method.equals("effective") ? "RULE_UNAVAILABLE: 规则中心不可用" : "RULE_AUDIT_FAILED: 规则命中记录保存失败",
                        failure.getMessage(), "remote failure uses fixed safe text");
                equal(null, failure.getCause(), "remote error body does not escape through cause");
            }
        }
        org.springframework.transaction.support.TransactionSynchronizationManager.setActualTransactionActive(true);
        try {
            fails(() -> available.effective(rule.getRuleCode()), "rule read forbidden within stock transaction");
            fails(() -> available.record(50L, rule, null, "WARN"), "rule hit forbidden within stock transaction");
        } finally { org.springframework.transaction.support.TransactionSynchronizationManager.setActualTransactionActive(false); }
    }

    static void privacy() throws Exception {
        OaConsumableRequest request = new OaConsumableRequest(); request.setRequestId(9007199254740993L); request.setRuleSnapshot("secret-cost"); request.setCreateHash("private-hash"); request.setTenantId(100000L);
        JsonNode result = json.readTree(json.writeValueAsString(request));
        equal("9007199254740993", result.path("requestId").asText(), "big identifier is a string"); check(result.path("requestId").isTextual(), "big identifier serialized as JSON text");
        check(!result.has("tenantId") && !result.has("ruleSnapshot") && !result.has("createHash"), "internal snapshot and hashes hidden");
        check(!result.has("totalAmount"), "absent cost does not serialize");
        ConsumableResults.ReportRow report = new ConsumableResults.ReportRow(); report.setIssuedQuantity(9007199254740993L); report.setNetAmount("1.25");
        JsonNode reportJson = json.readTree(json.writeValueAsString(report)); check(reportJson.path("issuedQuantity").isTextual(), "aggregate quantity preserves JS-safe precision");
        equal("1.25", reportJson.path("netAmount").asText(), "money result is decimal text");
    }

    static void mapperContracts() throws Exception {
        Path resources = Path.of("src/main/resources/mapper");
        MybatisConfiguration configuration = new MybatisConfiguration();
        List<String> files = List.of("SysConsumableMapper", "OaConsumableLedgerMapper", "OaConsumableRequestMapper", "OaConsumableRequestItemMapper", "OaConsumablePurchaseMapper", "OaConsumableMaintenanceMapper");
        for (String file : files) {
            Path path = resources.resolve(file + ".xml");
            try (InputStream stream = Files.newInputStream(path)) { new XMLMapperBuilder(stream, configuration, path.toString(), configuration.getSqlFragments()).parse(); }
            check(configuration.hasMapper(Class.forName("com.cloudflow.oa.mapper." + file)), "mapper parsed " + file);
        }
        ConsumableQuery query = new ConsumableQuery(); query.setGroupBy("PERSON");
        String sql = configuration.getMappedStatement("com.cloudflow.oa.mapper.OaConsumableLedgerMapper.usageReport").getBoundSql(Map.of("tenantId", 100000L, "query", query, "allData", true)).getSql();
        check(sql.contains("tenant_id") && sql.contains("beneficiary_id") && sql.contains("GROUP BY"), "usage query retains tenant and person grouping");
        String source = configuration.getMappedStatement("com.cloudflow.oa.mapper.OaConsumableLedgerMapper.sourceContext").getBoundSql(Map.of("tenantId", 100000L, "sourceType", "PURCHASE_RECEIPT", "sourceId", 1L)).getSql();
        check(source.contains("purchase.tenant_id = receipt.tenant_id"), "source detail joins same tenant");
    }

    static void endpointContracts() {
        Map<Class<?>, Set<String>> disabled = Map.of(ConsumableController.class, Set.of("addStock", "reduceStock"), ConsumableLedgerController.class,
                Set.of("reverse", "adjust", "scrap", "returnStock", "recalculate"), ConsumableRequestController.class, Set.of("create", "submit", "cancel", "issue"), PurchaseRequestController.class, Set.of("receipt"));
        disabled.forEach((type, names) -> names.forEach(name -> {
            List<Method> methods = Arrays.stream(type.getDeclaredMethods()).filter(method -> name.equals(method.getName())).toList();
            equal(1, methods.size(), "endpoint found: " + type.getSimpleName() + "." + name);
            Method method = methods.get(0);
            check(method.isAnnotationPresent(RepeatSubmit.Disabled.class), "immediate replay bypasses repeat filter: " + name);
            check(method.isAnnotationPresent(cn.dev33.satoken.annotation.SaCheckPermission.class), "endpoint permission: " + name);
        }));
    }

    static void identity(Long tenant, Long user) { TenantContext.clear(); TenantContext.setTenantId(tenant); UserContext.clear(); UserContext.setTenantId(tenant); UserContext.setUserId(user); UserContext.setUserName("oa08-check"); UserContext.setDeptId(100L); UserContext.setDsType(0); UserContext.setRoles(Set.of("oa")); }
    static BigDecimal number(String value) { return new BigDecimal(value); }
    static void check(boolean condition, String message) { equal(true, condition, message); }
    static void equal(Object expected, Object actual, String message) { if (!Objects.equals(expected, actual)) throw new AssertionError(message + " expected=" + expected + " actual=" + actual); assertions.incrementAndGet(); }
    static void decimal(String expected, BigDecimal actual, String message) { if (actual == null || number(expected).compareTo(actual) != 0) throw new AssertionError(message + " expected=" + expected + " actual=" + actual); assertions.incrementAndGet(); }
    interface Action { void run() throws Exception; }
    static void fails(Action action, String message) {
        try { action.run(); }
        catch (NullPointerException | ClassCastException | IndexOutOfBoundsException | UnsupportedOperationException failure) { throw new AssertionError(message + " failed in test setup", failure); }
        catch (IllegalArgumentException | IllegalStateException | com.fasterxml.jackson.core.JsonProcessingException | org.springframework.dao.DataAccessException failure) { assertions.incrementAndGet(); return; }
        catch (Exception failure) { throw new AssertionError(message + " failed unexpectedly", failure); }
        throw new AssertionError(message + " unexpectedly accepted");
    }
    static <Entity> Entity copy(Entity source) { if (source == null) return null; try { @SuppressWarnings("unchecked") Entity target = (Entity) source.getClass().getDeclaredConstructor().newInstance(); BeanUtils.copyProperties(source, target); return target; } catch (ReflectiveOperationException failure) { throw new IllegalStateException(failure); } }
    static <Type> Type proxy(Class<Type> type, BiFunction<String, Object[], Object> handler) {
        return type.cast(Proxy.newProxyInstance(type.getClassLoader(), new Class<?>[]{type}, (instance, method, arguments) -> {
            if (method.getDeclaringClass() == Object.class) return switch (method.getName()) { case "hashCode" -> System.identityHashCode(instance); case "equals" -> instance == arguments[0]; default -> "oa08-test:" + type.getSimpleName(); };
            return handler.apply(method.getName(), arguments == null ? new Object[0] : arguments);
        }));
    }
}
