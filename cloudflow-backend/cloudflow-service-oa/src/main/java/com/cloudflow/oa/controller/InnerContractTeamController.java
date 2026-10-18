package com.cloudflow.oa.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.common.security.annotation.Inner;
import com.cloudflow.oa.domain.dto.OaContractTeamRequest;
import com.cloudflow.oa.domain.vo.OaContractTeamView;
import com.cloudflow.oa.service.impl.OaContractTeamService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/inner/oa/contract-teams")
@RequiredArgsConstructor
public class InnerContractTeamController {
    private final OaContractTeamService teams;

    @GetMapping("/{id}")
    @Inner(allowedServices = "cloudflow-service-crm")
    @SaCheckPermission({"crm:deal-team:query", "oa:contract:list"})
    public R<OaContractTeamView> read(@PathVariable Long id, @RequestParam(required = false) Integer teamVersion) {
        try { return R.ok(teams.read(id, teamVersion)); }
        catch (IllegalArgumentException rejected) { return R.fail(rejected.getMessage()); }
    }

    @PutMapping("/{id}")
    @Inner(allowedServices = "cloudflow-service-crm")
    @SaCheckPermission({"crm:deal-team:manage", "oa:contract:list"})
    @RepeatSubmit
    @SysLog("维护合同销售分成团队")
    public R<OaContractTeamView> update(@PathVariable Long id, @RequestBody OaContractTeamRequest request) {
        try { return R.ok(teams.save(id, request)); }
        catch (IllegalArgumentException rejected) { return R.fail(rejected.getMessage()); }
    }
}
