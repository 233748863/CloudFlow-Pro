package com.cloudflow.auth.portal;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.exception.ServiceException;
import feign.FeignException;
import java.util.function.Supplier;

public final class PortalTicketResponses {
    private PortalTicketResponses() { }

    public static <Result> Result read(Supplier<R<Result>> operation) {
        R<Result> response;
        try { response = operation.get(); }
        catch (RuntimeException failure) {
            Throwable cause = failure;
            for (int depth = 0; depth < 8 && cause != null; depth++, cause = cause.getCause()) {
                if (cause instanceof FeignException remote) throw failed(remote.status());
            }
            throw failed(503);
        }
        if (response == null) throw failed(503);
        if (!response.isSuccess()) throw failed(response.getCode());
        if (response.getData() == null) throw failed(503);
        return response.getData();
    }

    private static ServiceException failed(Integer status) {
        if (Integer.valueOf(401).equals(status)) return new ServiceException("门户登录状态已失效，请重新登录", 401);
        if (Integer.valueOf(404).equals(status)) return new ServiceException("工单或附件不存在或无权访问", 404);
        if (Integer.valueOf(409).equals(status)) return new ServiceException("提交或附件状态已变化，请先核对原提交结果", 409);
        if (Integer.valueOf(400).equals(status)) return new ServiceException("工单内容或查询条件无效，请核对填写内容", 400);
        return new ServiceException("客户工单暂不可用，请保留输入并核对提交结果", 503);
    }
}
