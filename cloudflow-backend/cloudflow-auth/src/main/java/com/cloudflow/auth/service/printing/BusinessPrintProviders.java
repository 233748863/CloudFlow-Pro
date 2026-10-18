package com.cloudflow.auth.service.printing;

import cn.dev33.satoken.stp.StpUtil;
import com.cloudflow.auth.printing.PrintContext;
import com.cloudflow.auth.printing.PrintDataProvider;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.core.printing.PrintData;
import feign.FeignException;
import java.util.Objects;
import org.springframework.cloud.client.circuitbreaker.NoFallbackAvailableException;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class BusinessPrintProviders {
    @Bean PrintDataProvider salarySlipPrintProvider(HrPrintClient client) {
        return new RemoteProvider("SALARY_SLIP", "hr:ess:slip:view", client);
    }
    @Bean PrintDataProvider certificatePrintProvider(HrPrintClient client) {
        return new RemoteProvider("CERTIFICATE", "hr:ess:cert:view", client);
    }
    @Bean PrintDataProvider expenseClaimPrintProvider(OaPrintClient client) {
        return new RemoteProvider("EXPENSE_CLAIM", "oa:expense:list", client);
    }
    @Bean PrintDataProvider purchaseOrderPrintProvider(OaPrintClient client) {
        return new RemoteProvider("PURCHASE_ORDER", "oa:purchase:list", client);
    }

    private record RemoteProvider(String bizType, String permission, PrintRemoteApi client) implements PrintDataProvider {
        @Override public PrintData buildData(Long bizId, PrintContext context) {
            if (context == null || context.tenantId() == null || context.userId() == null
                    || !Objects.equals(context.tenantId(), UserContext.getTenantId())
                    || !Objects.equals(context.userId(), UserContext.getUserId())) throw new ServiceException("打印身份无效", 403);
            StpUtil.checkPermission(permission);
            R<PrintData> response;
            try { response = client.data(bizType, bizId); }
            catch (FeignException | NoFallbackAvailableException failure) {
                throw PrintRemoteFailures.translate(failure, "业务打印数据不可访问");
            }
            if (response == null || !response.isSuccess() || response.getData() == null) {
                int code = response != null ? PrintRemoteFailures.status(response.getCode()) : 503;
                throw new ServiceException("业务打印数据不可访问", code);
            }
            PrintData data = response.getData();
            if (!Objects.equals(context.tenantId(), data.tenantId()) || !bizType.equals(data.bizType())
                    || !bizId.toString().equals(data.bizId()) || data.values() == null) throw new ServiceException("业务打印响应不匹配", 403);
            return data;
        }
    }
}
