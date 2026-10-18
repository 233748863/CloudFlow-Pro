package com.cloudflow.auth.service.printing;

import com.cloudflow.auth.printing.PrintFieldFilter;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.core.printing.PrintData;
import feign.FeignException;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.cloud.client.circuitbreaker.NoFallbackAvailableException;

@Component
@RequiredArgsConstructor
public class WorkflowPrintFieldFilter implements PrintFieldFilter {
    private final WorkflowPrintClient client;

    @Override public Map<String, Object> filter(PrintData data) {
        if (data.instanceId() == null || data.instanceId().isBlank()) return data.values();
        R<Map<String, Object>> result;
        try { result = client.filter(data); }
        catch (FeignException | NoFallbackAvailableException failure) {
            throw PrintRemoteFailures.translate(failure, "打印字段权限校验失败");
        }
        if (result == null || !result.isSuccess() || result.getData() == null) {
            throw new ServiceException("打印字段权限校验失败", result != null ? PrintRemoteFailures.status(result.getCode()) : 503);
        }
        return result.getData();
    }
}
