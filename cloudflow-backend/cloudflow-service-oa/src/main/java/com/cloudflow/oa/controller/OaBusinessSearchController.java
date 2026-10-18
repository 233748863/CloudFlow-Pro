package com.cloudflow.oa.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.search.BusinessSearchGroup;
import com.cloudflow.common.core.search.BusinessSearchQuery;
import com.cloudflow.common.ratelimiter.annotation.RateLimiter;
import com.cloudflow.common.ratelimiter.enums.LimitType;
import com.cloudflow.common.security.annotation.Inner;
import com.cloudflow.oa.service.impl.OaBusinessSearchService;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/inner/oa/search")
@RequiredArgsConstructor
public class OaBusinessSearchController {
    private final OaBusinessSearchService service;

    @GetMapping
    @Inner(allowedServices = "cloudflow-auth")
    @SaCheckPermission("system:search:business")
    @RateLimiter(time = 60, count = 30, limitType = LimitType.USER)
    public R<List<BusinessSearchGroup>> search(@RequestParam("keyword") String keyword,
            @RequestParam(value = "limitPerType", defaultValue = "5") int limitPerType) {
        return R.ok(service.search(new BusinessSearchQuery(keyword, limitPerType)));
    }
}
