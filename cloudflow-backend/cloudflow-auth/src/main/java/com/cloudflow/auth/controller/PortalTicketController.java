package com.cloudflow.auth.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.auth.portal.PortalTicketResponses;
import com.cloudflow.auth.service.remote.RemotePortalTicketService;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.PortalTicketRequest;
import com.cloudflow.common.core.domain.PortalTicketVO;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.common.ratelimiter.annotation.RateLimiter;
import com.cloudflow.common.ratelimiter.enums.LimitType;
import com.cloudflow.common.security.portal.PortalContext;
import com.cloudflow.common.security.portal.PortalTokens;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/portal/crm/ticket")
@RequiredArgsConstructor
public class PortalTicketController {
    private final RemotePortalTicketService tickets;

    @GetMapping("/list")
    @SaCheckPermission(value = "crm:portal:ticket:list", type = "portal")
    @RateLimiter(key = "portal-ticket", count = 120, limitType = LimitType.IP)
    public R<PageResult<PortalTicketVO>> list(@RequestParam(required = false) String keyword,
            @RequestParam(required = false) String status, @RequestParam(defaultValue = "1") int pageNum,
            @RequestParam(defaultValue = "10") int pageSize, HttpServletRequest request) {
        query(request, Set.of("keyword", "status", "pageNum", "pageSize"));
        return R.ok(PortalTicketResponses.read(() -> tickets.list(request.getHeader(PortalTokens.HEADER), keyword, status, pageNum, pageSize)));
    }

    @GetMapping("/{id}")
    @SaCheckPermission(value = "crm:portal:ticket:list", type = "portal")
    @RateLimiter(key = "portal-ticket", count = 120, limitType = LimitType.IP)
    public R<PortalTicketVO> detail(@PathVariable Long id, HttpServletRequest request) {
        query(request, Set.of());
        return R.ok(PortalTicketResponses.read(() -> tickets.detail(request.getHeader(PortalTokens.HEADER), id)));
    }

    @GetMapping("/submission/{requestKey}")
    @SaCheckPermission(value = "crm:portal:ticket:add", type = "portal")
    @RateLimiter(key = "portal-ticket", count = 120, limitType = LimitType.IP)
    public R<PortalTicketVO> submission(@PathVariable String requestKey, HttpServletRequest request) {
        query(request, Set.of());
        return R.ok(PortalTicketResponses.read(() -> tickets.submission(request.getHeader(PortalTokens.HEADER), requestKey)));
    }

    @PostMapping
    @SaCheckPermission(value = "crm:portal:ticket:add", type = "portal")
    @RateLimiter(key = "portal-ticket", count = 120, limitType = LimitType.IP)
    @RepeatSubmit.Disabled
    @SysLog(value = "客户门户提交工单", logParams = false)
    public R<PortalTicketVO> create(@Valid @RequestBody PortalTicketRequest body, HttpServletRequest request) {
        query(request, Set.of());
        return R.ok(PortalTicketResponses.read(() -> tickets.create(request.getHeader(PortalTokens.HEADER), body)));
    }

    private static void query(HttpServletRequest request, Set<String> allowed) {
        PortalContext.require();
        if (request.getParameterMap().entrySet().stream().anyMatch(parameter -> !allowed.contains(parameter.getKey())
                || parameter.getValue().length != 1)) throw new ServiceException("请求包含不允许的查询条件", 400);
    }
}
