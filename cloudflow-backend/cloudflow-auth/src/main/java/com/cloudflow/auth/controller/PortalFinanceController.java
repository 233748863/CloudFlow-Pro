package com.cloudflow.auth.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.auth.portal.PortalFinanceReader;
import com.cloudflow.common.core.domain.*;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.ratelimiter.annotation.RateLimiter;
import com.cloudflow.common.ratelimiter.enums.LimitType;
import com.cloudflow.common.security.portal.PortalContext;
import com.cloudflow.common.security.portal.PortalTokens;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/portal/crm/{resource:receivable|invoice}")
@RequiredArgsConstructor
public class PortalFinanceController {
    private final PortalFinanceReader finance;

    @GetMapping("/list")
    @SaCheckPermission(value = "crm:portal:finance:list", type = "portal")
    @RateLimiter(key = "portal-finance", count = 120, limitType = LimitType.IP)
    public R<PageResult<PortalFinanceVO>> list(@PathVariable String resource, @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "1") int pageNum, @RequestParam(defaultValue = "10") int pageSize, HttpServletRequest request) {
        query(request, Set.of("keyword", "pageNum", "pageSize"));
        return R.ok(finance.list(kind(resource), request.getHeader(PortalTokens.HEADER), keyword, pageNum, pageSize));
    }

    @GetMapping("/{id}")
    @SaCheckPermission(value = "crm:portal:finance:list", type = "portal")
    @RateLimiter(key = "portal-finance", count = 120, limitType = LimitType.IP)
    public R<PortalFinanceVO> detail(@PathVariable String resource, @PathVariable Long id, HttpServletRequest request) {
        query(request, Set.of());
        return R.ok(finance.detail(kind(resource), request.getHeader(PortalTokens.HEADER), id));
    }

    private static String kind(String resource) {
        if ("receivable".equals(resource)) return "RECEIVABLE";
        if ("invoice".equals(resource)) return "INVOICE";
        throw new ServiceException("财务记录类型无效", 400);
    }
    private static void query(HttpServletRequest request, Set<String> allowed) {
        PortalContext.require();
        if (request.getParameterMap().entrySet().stream().anyMatch(parameter -> !allowed.contains(parameter.getKey())
                || parameter.getValue().length != 1)) throw new ServiceException("请求包含不允许的查询条件", 400);
    }
}
