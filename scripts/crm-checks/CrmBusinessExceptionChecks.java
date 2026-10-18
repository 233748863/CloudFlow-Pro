package com.cloudflow.crm.service.impl;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.crm.exception.CrmBusinessException;
import com.cloudflow.crm.exception.CrmExceptionHandler;
import jakarta.servlet.http.HttpServletRequest;
import java.lang.reflect.Method;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.math.BigDecimal;
import java.util.Arrays;

final class CrmBusinessExceptionChecks {
    static void run() throws ReflectiveOperationException {
        Method handler = CrmExceptionHandler.class.getMethod("handleBusinessException", CrmBusinessException.class, HttpServletRequest.class);
        CrmOperationsChecks.equal(java.util.List.of(CrmBusinessException.class),
                Arrays.asList(handler.getAnnotation(ExceptionHandler.class).value()), "only explicitly classified CRM business errors are exposed");
        CrmOperationsChecks.equal(java.util.List.of("com.cloudflow.crm.controller"),
                Arrays.asList(CrmExceptionHandler.class.getAnnotation(RestControllerAdvice.class).basePackages()), "CRM error advice is controller-scoped");
        HttpServletRequest request = CrmOperationsChecks.proxy(HttpServletRequest.class,
                (method, values) -> "getRequestURI".equals(method) ? "/activity/100" : null);
        ResponseEntity<R<?>> response = new CrmExceptionHandler().handleBusinessException(new CrmBusinessException("活动不存在或无权访问"), request);
        CrmOperationsChecks.equal(400, response.getStatusCode().value(), "business denial returns HTTP 400 rather than unknown 500");
        CrmOperationsChecks.equal(400, response.getBody().getCode(), "business denial body matches HTTP status");
        CrmOperationsChecks.equal("活动不存在或无权访问", response.getBody().getMsg(), "known safe business guidance reaches the client");
        classified(() -> CrmRecordSupport.require(null, "记录不存在"), "missing business record uses typed rejection");
        classified(() -> CrmRecordSupport.text("", 10, "名称"), "empty business text uses typed rejection");
        classified(() -> CrmRecordSupport.flag(2), "invalid flag uses typed rejection");
        classified(() -> CrmRecordSupport.money(BigDecimal.valueOf(-1), "金额"), "invalid money uses typed rejection");
        classified(() -> CrmRecordSupport.saved(0), "optimistic conflict uses typed rejection");
        CrmOperationsChecks.check(new CrmBusinessException("兼容性") instanceof IllegalArgumentException,
                "legacy CRM controller catches retain compatibility");
    }

    private static void classified(Runnable operation, String label) {
        try {
            operation.run();
            throw new AssertionError(label);
        } catch (CrmBusinessException expected) {
            CrmOperationsChecks.check(true, label);
        }
    }
}
