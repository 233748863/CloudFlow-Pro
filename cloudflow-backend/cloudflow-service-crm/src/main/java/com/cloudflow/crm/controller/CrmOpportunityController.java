package com.cloudflow.crm.controller;

import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.crm.domain.CrmOpportunity;
import com.cloudflow.crm.domain.dto.CrmOpportunityStageUpdateDTO;
import com.cloudflow.crm.domain.vo.CrmOpportunityBoardColumnVO;
import com.cloudflow.crm.service.ICrmOpportunityService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/opportunity")
@RequiredArgsConstructor
public class CrmOpportunityController {

    private final ICrmOpportunityService opportunityService;

    @GetMapping("/list")
    public R<PageResult<CrmOpportunity>> list(CrmOpportunity query, PageQuery pageQuery) {
        return R.ok(opportunityService.queryPage(query, pageQuery));
    }

    @GetMapping("/{id}")
    public R<CrmOpportunity> getInfo(@PathVariable("id") Long id) {
        CrmOpportunity opportunity = opportunityService.getById(id);
        return opportunity == null || !"0".equals(opportunity.getDelFlag()) ? R.fail("商机不存在") : R.ok(opportunity);
    }

    @GetMapping("/board")
    public R<List<CrmOpportunityBoardColumnVO>> board() {
        return R.ok(opportunityService.getBoard());
    }

    @SysLog("新增CRM商机")
    @PostMapping
    public R<Void> add(@RequestBody CrmOpportunity opportunity) {
        try {
            return R.result(opportunityService.createOpportunity(opportunity));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("修改CRM商机")
    @PutMapping
    public R<Void> edit(@RequestBody CrmOpportunity opportunity) {
        try {
            return R.result(opportunityService.updateOpportunity(opportunity));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("CRM商机赢单")
    @PostMapping("/{id}/win")
    public R<Void> win(@PathVariable("id") Long id) {
        try {
            return R.result(opportunityService.winOpportunity(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("CRM商机输单")
    @PostMapping("/{id}/lose")
    public R<Void> lose(@PathVariable("id") Long id, @RequestBody(required = false) CrmOpportunity payload) {
        try {
            return R.result(opportunityService.loseOpportunity(id, payload != null ? payload.getLostReason() : null));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("更新CRM商机阶段")
    @PutMapping("/stage")
    public R<Void> updateStage(@RequestBody CrmOpportunityStageUpdateDTO request) {
        try {
            return R.result(opportunityService.updateStage(request.getOpportunityId(), request.getStage(), request.getLostReason()));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("CRM商机生成项目草稿")
    @PostMapping("/{id}/project-draft")
    public R<Long> createProjectDraft(@PathVariable("id") Long id) {
        try {
            return R.ok(opportunityService.createProjectDraft(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("删除CRM商机")
    @DeleteMapping("/{ids}")
    public R<Void> remove(@PathVariable("ids") List<Long> ids) {
        for (Long id : ids) {
            CrmOpportunity opportunity = new CrmOpportunity();
            opportunity.setOpportunityId(id);
            opportunity.setDelFlag("1");
            opportunityService.updateById(opportunity);
        }
        return R.ok();
    }
}
