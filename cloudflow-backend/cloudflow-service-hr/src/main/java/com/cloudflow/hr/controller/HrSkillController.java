package com.cloudflow.hr.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import cn.dev33.satoken.annotation.SaMode;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.hr.domain.dto.HrSkillRequests;
import com.cloudflow.hr.domain.vo.skill.HrSkillViews;
import com.cloudflow.hr.service.HrHException;
import com.cloudflow.hr.service.HrSkillService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/skill")
@RequiredArgsConstructor
public class HrSkillController {
    private final HrSkillService service;

    @GetMapping("/list")
    @SaCheckPermission("hr:skill:list")
    public R<PageResult<HrSkillViews.Definition>> list(@Valid @ModelAttribute HrSkillRequests.Query query) {
        return R.ok(service.definitions(query));
    }

    @PostMapping
    @RepeatSubmit
    @SysLog(value = "新增技能", logParams = false)
    @SaCheckPermission("hr:skill:manage")
    public R<Long> create(@Valid @RequestBody HrSkillRequests.Definition input) {
        if (input.skillId() != null) throw HrHException.invalid("新增技能不能指定编号");
        return R.ok(service.saveDefinition(input));
    }

    @PutMapping
    @RepeatSubmit
    @SysLog(value = "修改技能", logParams = false)
    @SaCheckPermission("hr:skill:manage")
    public R<Long> update(@Valid @RequestBody HrSkillRequests.Definition input) {
        if (input.skillId() == null) throw HrHException.invalid("修改技能缺少编号");
        return R.ok(service.saveDefinition(input));
    }

    @GetMapping("/positions")
    @SaCheckPermission(value = {"hr:skill:manage", "hr:skill:gap"}, mode = SaMode.OR)
    public R<PageResult<HrSkillViews.Position>> positions(@Valid @ModelAttribute HrSkillRequests.Query query) {
        return R.ok(service.positions(query));
    }

    @PutMapping("/position/{positionId}")
    @RepeatSubmit
    @SysLog(value = "保存岗位技能要求", logParams = false)
    @SaCheckPermission("hr:skill:manage")
    public R<HrSkillViews.Position> savePosition(@PathVariable Long positionId,
            @Valid @RequestBody HrSkillRequests.PositionRequirements input) {
        return R.ok(service.savePosition(positionId, input));
    }

    @GetMapping("/courses")
    @SaCheckPermission("hr:skill:manage")
    public R<PageResult<HrSkillViews.Course>> courses(@Valid @ModelAttribute HrSkillRequests.Query query) {
        return R.ok(service.courses(query));
    }

    @PutMapping("/course/{courseId}")
    @RepeatSubmit
    @SysLog(value = "保存课程技能目标", logParams = false)
    @SaCheckPermission("hr:skill:manage")
    public R<HrSkillViews.Course> saveCourse(@PathVariable Long courseId,
            @Valid @RequestBody HrSkillRequests.CourseTarget input) {
        return R.ok(service.saveCourse(courseId, input));
    }

    @GetMapping("/employees")
    @SaCheckPermission(value = {"hr:skill:assess", "hr:skill:gap"}, mode = SaMode.OR)
    public R<PageResult<HrSkillViews.Employee>> employees(@Valid @ModelAttribute HrSkillRequests.Query query) {
        return R.ok(service.employees(query));
    }

    @GetMapping("/assessments")
    @SaCheckPermission("hr:skill:assess")
    public R<PageResult<HrSkillViews.Assessment>> assessments(@Valid @ModelAttribute HrSkillRequests.Query query) {
        return R.ok(service.assessments(query, false));
    }

    @PostMapping("/assessment")
    @RepeatSubmit
    @SysLog(value = "核实员工技能", logParams = false)
    @SaCheckPermission("hr:skill:assess")
    public R<Long> assess(@Valid @RequestBody HrSkillRequests.Assessment input) {
        return R.ok(service.assess(input));
    }

    @PostMapping("/assessment/{id}/review")
    @RepeatSubmit
    @SysLog(value = "审核技能自报", logParams = false)
    @SaCheckPermission("hr:skill:assess")
    public R<Long> review(@PathVariable Long id, @Valid @RequestBody HrSkillRequests.Review input) {
        return R.ok(service.review(id, input));
    }

    @PostMapping("/self-assessment")
    @RepeatSubmit
    @SysLog(value = "提交本人技能自报", logParams = false)
    @SaCheckPermission("hr:skill:self-submit")
    public R<Long> submitSelf(@Valid @RequestBody HrSkillRequests.SelfAssessment input) {
        return R.ok(service.selfAssessment(input));
    }

    @GetMapping("/mine")
    @SaCheckPermission("hr:skill:own")
    public R<HrSkillViews.Profile> mine(@Valid @ModelAttribute HrSkillRequests.Query query) {
        return R.ok(service.mine(query));
    }

    @GetMapping("/mine/recommendations")
    @SaCheckPermission("hr:skill:own")
    public R<HrSkillViews.EmployeeGap> recommendations() { return R.ok(service.recommendations()); }

    @GetMapping("/gap")
    @SaCheckPermission("hr:skill:gap")
    public R<PageResult<HrSkillViews.EmployeeGap>> gap(@Valid @ModelAttribute HrSkillRequests.Query query) {
        return R.ok(service.gaps(query));
    }
}
