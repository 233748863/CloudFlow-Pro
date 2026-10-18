package com.cloudflow.hr.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import cn.dev33.satoken.annotation.SaMode;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.hr.domain.dto.HrAppraisalRequests;
import com.cloudflow.hr.domain.dto.HrHRequests;
import com.cloudflow.hr.domain.vo.performance.HrAppraisalViews;
import com.cloudflow.hr.service.HrAppraisalService;
import com.cloudflow.hr.service.HrAppraisalInvitations;
import com.cloudflow.hr.service.HrAppraisalTargets;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/appraisal-cycle")
@RequiredArgsConstructor
public class HrAppraisalController {
    private final HrAppraisalService service;
    private final HrAppraisalTargets targets;
    private final HrAppraisalInvitations invitations;

    @GetMapping("/invitations/mine")
    @SaCheckPermission("hr:appraisal:respond")
    public R<PageResult<HrAppraisalViews.Invitation>> invitations(@Valid @ModelAttribute HrAppraisalRequests.InvitationQuery query) { return R.ok(invitations.mine(query)); }

    @GetMapping("/invitations/mine/{id}")
    @SaCheckPermission("hr:appraisal:respond")
    public R<HrAppraisalViews.Invitation> invitation(@PathVariable Long id) { return R.ok(invitations.detail(id)); }

    @PostMapping("/invitations/mine/{id}/response")
    @SaCheckPermission("hr:appraisal:respond")
    @RepeatSubmit
    @SysLog("提交本人受邀绩效评分")
    public R<Void> respond(@PathVariable Long id, @Valid @RequestBody HrAppraisalRequests.Response input) { invitations.respond(id, input); return R.ok(); }

    @GetMapping("/options")
    @SaCheckPermission("hr:appraisal:manage")
    public R<HrAppraisalViews.Options> options() { return R.ok(service.options()); }

    @GetMapping("/people")
    @SaCheckPermission(value = {"hr:appraisal:manage", "hr:appraisal:calibrate"}, mode = SaMode.OR)
    public R<PageResult<HrAppraisalViews.Employee>> people(@Valid @ModelAttribute HrAppraisalRequests.Query query) { return R.ok(service.people(query)); }

    @GetMapping("/list")
    @SaCheckPermission("hr:appraisal:list")
    public R<PageResult<HrAppraisalViews.Cycle>> list(@Valid @ModelAttribute HrAppraisalRequests.Query query) { return R.ok(service.list(query, false)); }

    @GetMapping("/{id}")
    @SaCheckPermission("hr:appraisal:list")
    public R<HrAppraisalViews.Detail> detail(@PathVariable Long id) { return R.ok(service.detail(id, false)); }

    @GetMapping("/mine")
    @SaCheckPermission("hr:appraisal:own")
    public R<PageResult<HrAppraisalViews.Cycle>> mine(@Valid @ModelAttribute HrAppraisalRequests.Query query) { return R.ok(service.list(query, true)); }

    @GetMapping("/mine/{id}")
    @SaCheckPermission("hr:appraisal:own")
    public R<HrAppraisalViews.Detail> mineDetail(@PathVariable Long id) { return R.ok(service.detail(id, true)); }

    @GetMapping("/{id}/preview")
    @SaCheckPermission("hr:appraisal:manage")
    public R<HrAppraisalViews.Preview> preview(@PathVariable Long id) { return R.ok(service.preview(id)); }

    @PostMapping
    @SaCheckPermission("hr:appraisal:manage")
    @RepeatSubmit
    @SysLog("创建绩效周期")
    public R<Long> create(@Valid @RequestBody HrAppraisalRequests.Draft input) {
        if (input.getCycleId() != null) throw new IllegalArgumentException("新增周期不能指定周期ID");
        return R.ok(service.save(input));
    }

    @PutMapping
    @SaCheckPermission("hr:appraisal:manage")
    @RepeatSubmit
    @SysLog("更新绩效周期草稿")
    public R<Long> update(@Valid @RequestBody HrAppraisalRequests.Draft input) {
        if (input.getCycleId() == null) throw new IllegalArgumentException("更新周期须指定周期ID");
        return R.ok(service.save(input));
    }

    @DeleteMapping("/{id}")
    @SaCheckPermission("hr:appraisal:manage")
    @RepeatSubmit
    @SysLog("删除绩效周期草稿")
    public R<Void> remove(@PathVariable Long id, @RequestParam Integer version) { service.remove(id, version); return R.ok(); }

    @PutMapping("/{id}/kras")
    @SaCheckPermission("hr:appraisal:manage")
    @RepeatSubmit
    @SysLog("配置关键成果领域")
    public R<Void> saveKras(@PathVariable Long id, @Valid @RequestBody HrAppraisalRequests.Kras input) { service.saveKras(id, input); return R.ok(); }

    @PutMapping("/{id}/goals")
    @SaCheckPermission("hr:appraisal:manage")
    @RepeatSubmit
    @SysLog("维护周期目标树")
    public R<Long> saveGoals(@PathVariable Long id, @Valid @RequestBody HrAppraisalRequests.GoalTree input) { return R.ok(targets.saveGoals(id, input)); }

    @DeleteMapping("/{id}/goals/{objectiveId}")
    @SaCheckPermission("hr:appraisal:manage")
    @RepeatSubmit
    @SysLog("移除未冻结周期目标")
    public R<Void> removeGoal(@PathVariable Long id, @PathVariable Long objectiveId, @RequestParam Integer version) { targets.removeGoal(id, objectiveId, version); return R.ok(); }

    @PutMapping("/{id}/distribution")
    @SaCheckPermission("hr:appraisal:manage")
    @RepeatSubmit
    @SysLog("配置周期分布规则")
    public R<Void> saveDistribution(@PathVariable Long id, @Valid @RequestBody HrAppraisalRequests.Distribution input) { service.saveDistribution(id, input); return R.ok(); }

    @PostMapping("/{id}/goal-score")
    @SaCheckPermission("hr:appraisal:score")
    @RepeatSubmit
    @SysLog("记录周期目标评分")
    public R<Void> scoreGoal(@PathVariable Long id, @Valid @RequestBody HrAppraisalRequests.GoalScore input) { targets.scoreGoal(id, input); return R.ok(); }

    @PostMapping("/{id}/transition")
    @SaCheckPermission("hr:appraisal:transition")
    @RepeatSubmit
    @SysLog("推进绩效周期")
    public R<String> transition(@PathVariable Long id, @Valid @RequestBody HrAppraisalRequests.Transition input) { return R.ok(service.transition(id, input)); }

    @PostMapping("/{id}/calculate")
    @SaCheckPermission("hr:appraisal:score")
    @RepeatSubmit
    @SysLog("计算周期总分")
    public R<HrAppraisalViews.Calculated> calculate(@PathVariable Long id, @Valid @RequestBody HrHRequests.VersionDTO input) { return R.ok(service.calculate(id, input.getVersion())); }

    @PostMapping("/{id}/calibration")
    @SaCheckPermission("hr:appraisal:calibrate")
    @RepeatSubmit
    @SysLog("校准周期结果")
    public R<Void> calibrate(@PathVariable Long id, @Valid @RequestBody HrAppraisalRequests.Calibration input) { service.calibrate(id, input); return R.ok(); }

    @PostMapping("/{id}/calibration-session")
    @SaCheckPermission("hr:appraisal:calibrate")
    @RepeatSubmit
    @SysLog("维护周期校准会议")
    public R<Long> saveSession(@PathVariable Long id, @Valid @RequestBody HrAppraisalRequests.Session input) { return R.ok(service.saveSession(id, input)); }
}
