package com.cloudflow.auth.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.auth.service.search.BusinessSearchService;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.search.BusinessSearchQuery;
import com.cloudflow.common.core.search.BusinessSearchResponse;
import com.cloudflow.common.ratelimiter.annotation.RateLimiter;
import com.cloudflow.common.ratelimiter.enums.LimitType;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/system/search")
@RequiredArgsConstructor
public class BusinessSearchController {
    private final BusinessSearchService service;

    @GetMapping("/business")
    @SaCheckPermission("system:search:business")
    @RateLimiter(time = 60, count = 30, limitType = LimitType.USER)
    public R<BusinessSearchResponse> search(@RequestParam("keyword") String keyword,
            @RequestParam(value = "limitPerType", defaultValue = "5") int limitPerType) {
        return R.ok(service.search(new BusinessSearchQuery(keyword, limitPerType)));
    }
}
