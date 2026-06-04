package com.cloudflow.crm.controller;

import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.crm.domain.CrmOpportunity;
import com.cloudflow.crm.domain.dto.CrmOpportunityStageUpdateDTO;
import com.cloudflow.crm.domain.vo.CrmOpportunityBoardColumnVO;
import com.cloudflow.crm.service.ICrmApprovalService;
import com.cloudflow.crm.service.ICrmOpportunityService;
import lombok.RequiredArgsConstructor;
import cn.dev33.satoken.annotation.SaCheckLogin;
import cn.dev33.satoken.annotation.SaCheckPermission;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/opportunity")
@SaCheckLogin
@RequiredArgsConstructor
public class CrmOpportunityController {

    private final ICrmOpportunityService crmOpportunityService;
    private final ICrmApprovalService crmApprovalService;

    @GetMapping("/list")
    @SaCheckPermission("crm:opportunity:list")
    public R<PageResult<CrmOpportunity>> list(CrmOpportunity query, PageQuery pageQuery) {
        return R.ok(crmOpportunityService.queryPage(query, pageQuery));
    }

    @GetMapping("/{id}")
    @SaCheckPermission("crm:opportunity:list")
    public R<CrmOpportunity> getInfo(@PathVariable("id") Long id) {
        try {
            return R.ok(crmOpportunityService.getAccessibleOpportunity(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @GetMapping("/board")
    @SaCheckPermission("crm:opportunity:list")
    public R<List<CrmOpportunityBoardColumnVO>> board() {
        return R.ok(crmOpportunityService.getBoard());
    }

    @SysLog("新增CRM商机")
    // M0-8: 防重复提交
    @RepeatSubmit
    @PostMapping
    @SaCheckPermission("crm:opportunity:add")
    public R<Void> add(@RequestBody CrmOpportunity opportunity) {
        try {
            return R.result(crmOpportunityService.createOpportunity(opportunity));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("修改CRM商机")
    @PutMapping
    @SaCheckPermission("crm:opportunity:edit")
    public R<Void> edit(@RequestBody CrmOpportunity opportunity) {
        try {
            return R.result(crmOpportunityService.updateOpportunity(opportunity));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("CRM商机赢单")
    @PostMapping("/{id}/win")
    @SaCheckPermission("crm:opportunity:win")
    public R<Void> win(@PathVariable("id") Long id) {
        try {
            return R.result(crmOpportunityService.winOpportunity(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("CRM商机输单")
    @PostMapping("/{id}/lose")
    @SaCheckPermission("crm:approval:opportunity-downgrade")
    public R<Long> lose(@PathVariable("id") Long id, @RequestBody(required = false) CrmOpportunity payload) {
        try {
            return R.ok(crmApprovalService.submitOpportunityDowngrade(
                    id,
                    "CLOSE",
                    null,
                    payload != null ? payload.getLostReason() : null));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("更新CRM商机阶段")
    @PutMapping("/stage")
    @SaCheckPermission("crm:opportunity:edit")
    public R<Void> updateStage(@RequestBody CrmOpportunityStageUpdateDTO request) {
        try {
            CrmOpportunity opportunity = crmOpportunityService.getAccessibleOpportunity(request.getOpportunityId());
            if (requiresDowngradeApproval(opportunity, request.getStage())) {
                return R.fail("商机降级/输单已切换为审批流程，请调用 /crm/approval/opportunity-downgrade");
            }
            return R.result(crmOpportunityService.updateStage(request.getOpportunityId(), request.getStage(), request.getLostReason()));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("CRM商机生成项目草稿")
    @RepeatSubmit
    @PostMapping("/{id}/project-draft")
    @SaCheckPermission("crm:project:draft")
    public R<Long> createProjectDraft(@PathVariable("id") Long id) {
        try {
            return R.ok(crmOpportunityService.createProjectDraft(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("删除CRM商机")
    @DeleteMapping("/{ids}")
    @SaCheckPermission("crm:opportunity:remove")
    public R<Void> remove(@PathVariable("ids") List<Long> ids) {
        for (Long id : ids) {
            try {
                crmOpportunityService.getAccessibleOpportunity(id);
            } catch (IllegalArgumentException e) {
                return R.fail(e.getMessage());
            }
            CrmOpportunity opportunity = new CrmOpportunity();
            opportunity.setOpportunityId(id);
            opportunity.setDeleted(1);
            crmOpportunityService.updateById(opportunity);
        }
        return R.ok();
    }

    private boolean requiresDowngradeApproval(CrmOpportunity current, String targetStage) {
        if (current == null || !StringUtils.hasText(targetStage)) {
            return false;
        }
        if ("LOST".equalsIgnoreCase(targetStage)) {
            return true;
        }
        return stageOrder(targetStage) < stageOrder(current.getStage());
    }

    private int stageOrder(String stage) {
        return switch (stage == null ? "" : stage.toUpperCase()) {
            case "LEAD" -> 1;
            case "QUALIFIED" -> 2;
            case "PROPOSAL" -> 3;
            case "NEGOTIATION" -> 4;
            case "WON" -> 5;
            case "LOST" -> 6;
            default -> Integer.MAX_VALUE;
        };
    }
}
