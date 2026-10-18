package com.cloudflow.workflow.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import cn.dev33.satoken.annotation.SaMode;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.common.ratelimiter.annotation.RateLimiter;
import com.cloudflow.common.ratelimiter.enums.LimitType;
import com.cloudflow.workflow.domain.vo.DraftDetailVO;
import com.cloudflow.workflow.domain.vo.DraftLaunchContextVO;
import com.cloudflow.workflow.domain.vo.DraftSaveResult;
import com.cloudflow.workflow.domain.vo.DraftSummaryVO;
import com.cloudflow.workflow.domain.vo.WorkflowFormReferenceVO;
import com.cloudflow.workflow.service.WorkflowDraftReferenceService;
import com.cloudflow.workflow.service.WfFormDraftService;
import com.cloudflow.workflow.service.WorkflowDraftJson;
import com.cloudflow.workflow.service.WorkflowLaunchContextService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/wf/draft")
@RequiredArgsConstructor
public class WorkflowDraftController {
    private final WfFormDraftService drafts;
    private final WorkflowLaunchContextService contexts;
    private final WorkflowDraftJson json;
    private final WorkflowDraftReferenceService references;

    @GetMapping("/context/{definitionId}")
    @SaCheckPermission(value = {"workflow:draft:view", "workflow:draft:save"}, mode = SaMode.OR)
    public R<DraftLaunchContextVO> context(@PathVariable String definitionId) {
        return R.ok(contexts.context(definitionId));
    }

    @GetMapping("/context/{definitionId}/references/{fieldId}")
    @SaCheckPermission(value = {"workflow:draft:view", "workflow:draft:save"}, mode = SaMode.OR)
    public R<PageResult<WorkflowFormReferenceVO>> referenceOptions(@PathVariable String definitionId,
                                                                 @PathVariable String fieldId,
                                                                 @ModelAttribute PageQuery query) {
        return R.ok(references.options(definitionId, fieldId, query));
    }

    @PostMapping
    @SaCheckPermission("workflow:draft:save")
    @RepeatSubmit
    @SysLog(value = "保存本人流程草稿", logParams = false)
    @RateLimiter(time = 60, count = 30, limitType = LimitType.USER)
    public R<DraftSaveResult> saveDraft(@RequestBody String body) {
        return R.ok(drafts.save(json.readRequest(body)));
    }

    @GetMapping("/list")
    @SaCheckPermission("workflow:draft:list")
    public R<PageResult<DraftSummaryVO>> list(@ModelAttribute PageQuery query,
                                            @RequestParam(required = false) String keyword,
                                            @RequestParam(required = false) String definitionId) {
        return R.ok(drafts.list(query, keyword, definitionId));
    }

    @GetMapping("/by-definition/{definitionId}")
    @SaCheckPermission("workflow:draft:view")
    public R<DraftSummaryVO> byDefinition(@PathVariable String definitionId) {
        return R.ok(drafts.byDefinition(definitionId));
    }

    @GetMapping("/{draftId}")
    @SaCheckPermission("workflow:draft:view")
    public R<DraftDetailVO> detail(@PathVariable String draftId) {
        return R.ok(drafts.detail(draftId));
    }

    @DeleteMapping("/{draftId}")
    @SaCheckPermission("workflow:draft:remove")
    @RepeatSubmit
    @SysLog(value = "删除本人流程草稿", logParams = false)
    public R<Void> removeDraft(@PathVariable String draftId, @RequestParam Integer expectedVersion) {
        drafts.remove(draftId, expectedVersion);
        return R.ok();
    }
}
