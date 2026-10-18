package com.cloudflow.crm.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.crm.mapper.CrmCommissionMapper.Filters;
import com.cloudflow.crm.mapper.CrmCommissionMapper.Row;
import com.cloudflow.crm.service.deal.CrmCommissionService;
import java.time.LocalDate;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/deal-allocation")
@RequiredArgsConstructor
public class CrmDealAllocationController {
    private final CrmCommissionService commissions;
    @GetMapping("/list")
    @SaCheckPermission("crm:deal-allocation:list")
    public R<PageResult<Row>> list(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
            @RequestParam(required = false) String currency, @RequestParam(required = false) String eventType,
            @RequestParam(required = false) String bizType, @RequestParam(required = false) Long bizId,
            @RequestParam(defaultValue = "1") int pageNum, @RequestParam(defaultValue = "20") int pageSize) {
        return R.ok(PageResult.build(commissions.list(new Filters(startDate, endDate, currency, eventType, bizType, bizId), pageNum, pageSize)));
    }
}
