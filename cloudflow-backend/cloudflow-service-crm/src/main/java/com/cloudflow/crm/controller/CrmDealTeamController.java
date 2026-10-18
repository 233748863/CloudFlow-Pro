package com.cloudflow.crm.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.crm.domain.dto.CrmDealTeamRequest;
import com.cloudflow.crm.domain.vo.CrmDealTeamView;
import com.cloudflow.crm.exception.CrmBusinessException;
import com.cloudflow.crm.service.deal.CrmOpportunityTeamService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/deal-team")
@RequiredArgsConstructor
public class CrmDealTeamController {
    private final CrmOpportunityTeamService opportunities;
    private final com.cloudflow.crm.service.deal.CrmQuoteTeamService quotes;
    private final com.cloudflow.crm.service.deal.CrmContractTeamService contracts;
    private final com.cloudflow.crm.service.deal.CrmReceivableTeamService receivables;

    @GetMapping("/{bizType}/{id}")
    @SaCheckPermission("crm:deal-team:query")
    public R<CrmDealTeamView> opportunity(@PathVariable String bizType, @PathVariable Long id, @RequestParam(required = false) Integer teamVersion) {
        requireSupported(bizType);
        if ("RECEIVABLE".equals(bizType)) return R.ok(receivables.read(id, teamVersion));
        if ("CONTRACT".equals(bizType)) return R.ok(contracts.read(id, teamVersion));
        if ("QUOTE".equals(bizType)) return R.ok(quotes.read(id, teamVersion));
        return R.ok(opportunities.read(id, teamVersion));
    }

    @PutMapping("/{bizType}/{id}")
    @SaCheckPermission("crm:deal-team:manage")
    @RepeatSubmit
    @SysLog("维护销售分成团队")
    public R<CrmDealTeamView> updateOpportunity(@PathVariable String bizType, @PathVariable Long id, @RequestBody CrmDealTeamRequest request) {
        requireSupported(bizType);
        if ("RECEIVABLE".equals(bizType)) return R.ok(receivables.save(id, request));
        if ("CONTRACT".equals(bizType)) return R.ok(contracts.save(id, request));
        if ("QUOTE".equals(bizType)) return R.ok(quotes.save(id, request));
        return R.ok(opportunities.save(id, request));
    }

    private void requireSupported(String bizType) {
        String permission = switch (bizType) {
            case "OPPORTUNITY" -> "crm:opportunity:list";
            case "QUOTE" -> "crm:quote:list";
            case "CONTRACT" -> "oa:contract:list";
            case "RECEIVABLE" -> "crm:receivable:list";
            default -> throw new CrmBusinessException("业务团队类型无效");
        };
        cn.dev33.satoken.stp.StpUtil.checkPermission(permission);
    }
}
