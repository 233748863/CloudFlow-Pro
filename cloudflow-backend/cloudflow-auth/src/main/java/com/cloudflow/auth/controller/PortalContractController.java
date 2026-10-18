package com.cloudflow.auth.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.auth.service.remote.RemotePortalContractService;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.PortalContractVO;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.ratelimiter.annotation.RateLimiter;
import com.cloudflow.common.ratelimiter.enums.LimitType;
import com.cloudflow.common.security.portal.PortalContext;
import com.cloudflow.common.security.portal.PortalTokens;
import feign.FeignException;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Set;
import java.util.function.Supplier;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/portal/crm/contract")
@RequiredArgsConstructor
public class PortalContractController {
    private final RemotePortalContractService contracts;

    @GetMapping("/list")
    @SaCheckPermission(value = "crm:portal:contract:list", type = "portal")
    @RateLimiter(key = "portal-contract", count = 120, limitType = LimitType.IP)
    public R<PageResult<PortalContractVO>> list(@RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "1") int pageNum, @RequestParam(defaultValue = "10") int pageSize,
            HttpServletRequest request) {
        validateQuery(request, Set.of("keyword", "pageNum", "pageSize"));
        return R.ok(read(() -> contracts.list(request.getHeader(PortalTokens.HEADER), keyword, pageNum, pageSize)));
    }

    @GetMapping("/{id}")
    @SaCheckPermission(value = "crm:portal:contract:list", type = "portal")
    @RateLimiter(key = "portal-contract", count = 120, limitType = LimitType.IP)
    public R<PortalContractVO> detail(@PathVariable Long id, HttpServletRequest request) {
        validateQuery(request, Set.of());
        return R.ok(read(() -> contracts.detail(request.getHeader(PortalTokens.HEADER), id)));
    }

    private static void validateQuery(HttpServletRequest request, Set<String> allowed) {
        PortalContext.require();
        if (request.getParameterMap().entrySet().stream().anyMatch(parameter -> !allowed.contains(parameter.getKey())
                || parameter.getValue().length != 1)) throw new ServiceException("请求包含不允许的查询条件", 400);
    }

    private static <Result> Result read(Supplier<R<Result>> operation) {
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
        if (Integer.valueOf(404).equals(status)) return new ServiceException("合同不存在或尚未向客户开放", 404);
        if (Integer.valueOf(400).equals(status)) return new ServiceException("合同查询条件无效", 400);
        return new ServiceException("客户合同暂不可用，请稍后重试", 503);
    }
}
