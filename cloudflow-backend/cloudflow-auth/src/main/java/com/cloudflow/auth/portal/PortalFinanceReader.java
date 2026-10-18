package com.cloudflow.auth.portal;

import com.cloudflow.auth.service.remote.RemoteCrmFinanceService;
import com.cloudflow.auth.service.remote.RemoteOaFinanceService;
import com.cloudflow.common.core.domain.*;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.core.utils.PortalFinanceRules;
import feign.FeignException;
import java.util.function.Supplier;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class PortalFinanceReader {
    private final RemoteCrmFinanceService crm;
    private final RemoteOaFinanceService oa;

    public PageResult<PortalFinanceVO> list(String kind, String token, String keyword, int pageNum, int pageSize) {
        PortalFinanceRules.kind(kind);
        return read(() -> "RECEIVABLE".equals(kind) ? crm.list(token, keyword, pageNum, pageSize) : oa.list(token, keyword, pageNum, pageSize));
    }
    public PortalFinanceVO detail(String kind, String token, Long id) {
        PortalFinanceRules.kind(kind);
        return read(() -> "RECEIVABLE".equals(kind) ? crm.detail(token, id) : oa.detail(token, id));
    }
    public PortalFinanceFile file(String kind, String token, Long id, Long fileId) {
        PortalFinanceRules.kind(kind);
        return read(() -> "RECEIVABLE".equals(kind) ? crm.file(token, id, fileId) : oa.file(token, id, fileId));
    }
    private static <Result> Result read(Supplier<R<Result>> action) {
        R<Result> result;
        try { result = action.get(); }
        catch (RuntimeException failure) {
            Throwable cause = failure;
            for (int depth = 0; depth < 8 && cause != null; depth++, cause = cause.getCause())
                if (cause instanceof FeignException remote) throw failed(remote.status());
            throw failed(503);
        }
        if (result == null || result.isSuccess() && result.getData() == null) throw failed(503);
        if (!result.isSuccess()) throw failed(result.getCode());
        return result.getData();
    }
    private static ServiceException failed(Integer status) {
        if (Integer.valueOf(401).equals(status)) return new ServiceException("门户登录状态已失效，请重新登录", 401);
        if (Integer.valueOf(404).equals(status)) return new ServiceException("财务记录或票据不存在或尚未公开", 404);
        if (Integer.valueOf(400).equals(status)) return new ServiceException("财务记录查询条件无效", 400);
        return new ServiceException("客户财务记录暂不可用，请稍后重试", 503);
    }
}
