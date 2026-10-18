package com.cloudflow.oa.controller;

import com.cloudflow.common.core.domain.R;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import java.util.Map;
import java.util.Set;

@RestControllerAdvice(assignableTypes = {ConsumableController.class, ConsumableLedgerController.class, ConsumableRequestController.class})
@Order(Ordered.HIGHEST_PRECEDENCE)
public class ConsumableExceptionHandler {
    private static final Set<String> CONFLICTS = Set.of("IDEMPOTENCY_CONFLICT", "VERSION_CONFLICT", "STOCK_NOT_ENOUGH");
    private static final Map<String, String> MESSAGES = Map.ofEntries(
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
            Map.entry("REVERSAL_NOT_ALLOWED", "当前台账不符合冲正条件"),
            Map.entry("INVALID_PARAMETER", "耗材业务参数无效，请核对后重试"));

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<R<Void>> invalidCommand(IllegalArgumentException exception) {
        return rejection(exception);
    }

    public static <Result> ResponseEntity<R<Result>> rejection(IllegalArgumentException exception) {
        String detail = exception.getMessage();
        int separator = detail == null ? -1 : detail.indexOf(':');
        String candidate = detail == null ? "" : separator < 0 ? detail : detail.substring(0, separator);
        String code = MESSAGES.containsKey(candidate) ? candidate : "INVALID_PARAMETER";
        HttpStatus status = CONFLICTS.contains(code) ? HttpStatus.CONFLICT : HttpStatus.BAD_REQUEST;
        return ResponseEntity.status(status).body(R.fail(status.value(), code + ": " + MESSAGES.get(code)));
    }
}
