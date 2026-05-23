package com.cloudflow.hr.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.hr.domain.dto.HrAttendanceAppealPayload;
import com.cloudflow.hr.domain.dto.HrCompensationSimulateRequest;
import com.cloudflow.hr.domain.dto.HrPerformanceInterviewPayload;
import com.cloudflow.hr.domain.dto.HrResumeParsedFieldsPayload;
import com.cloudflow.hr.domain.entity.HrAttendanceAppeal;
import com.cloudflow.hr.domain.entity.HrPerformanceInterview;
import com.cloudflow.hr.service.HrAttendanceAppealService;
import com.cloudflow.hr.service.HrCompensationSimulationService;
import com.cloudflow.hr.service.HrResumeParserService;
import com.cloudflow.hr.service.HrTypedCrudService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * HR-P1-1 简历解析端点。
 */
@RestController
@RequestMapping("/recruitment/resume")
@RequiredArgsConstructor
class HrResumeParseController {

    private final HrResumeParserService parserService;

    @SysLog("触发HR简历解析")
    @PostMapping("/parse")
    @SaCheckPermission("hr:recruitment:edit")
    public R<Long> parseResume(@RequestBody Map<String, Object> body) {
        Long candidateId = body.get("candidateId") == null
                ? null : Long.valueOf(String.valueOf(body.get("candidateId")));
        String resumeUrl = body.get("resumeUrl") == null ? null : String.valueOf(body.get("resumeUrl"));
        String rawText = body.get("rawText") == null ? "" : String.valueOf(body.get("rawText"));
        return R.ok(parserService.parseResume(candidateId, resumeUrl, rawText));
    }

    @GetMapping("/parsed")
    @SaCheckPermission("hr:recruitment:view")
    public R<List<Map<String, Object>>> listParsed(@RequestParam Long candidateId) {
        return R.ok(parserService.listParsed(candidateId));
    }

    @PutMapping("/parsed/{id}")
    @SaCheckPermission("hr:recruitment:edit")
    public R<Void> updateParsed(@PathVariable Long id, @RequestBody HrResumeParsedFieldsPayload payload) {
        parserService.updateParsed(id, payload);
        return R.ok();
    }

    @SysLog("HR复核简历解析-确认")
    @PostMapping("/parsed/{id}/confirm")
    @SaCheckPermission("hr:recruitment:edit")
    public R<Void> confirmParsed(@PathVariable Long id) {
        parserService.confirmParsed(id);
        return R.ok();
    }

    @SysLog("HR复核简历解析-驳回")
    @PostMapping("/parsed/{id}/reject")
    @SaCheckPermission("hr:recruitment:edit")
    public R<Void> rejectParsed(@PathVariable Long id, @RequestParam(required = false) String reason) {
        parserService.rejectParsed(id, reason);
        return R.ok();
    }
}

/**
 * HR-P1-2 薪酬模拟端点（不持久化）。
 */
@RestController
@RequestMapping("/compensation")
@RequiredArgsConstructor
class HrCompensationSimulateController {

    private final HrCompensationSimulationService simulationService;

    @SysLog("HR薪酬模拟")
    @PostMapping("/simulate")
    @SaCheckPermission("hr:compensation:view")
    public R<Map<String, Object>> simulate(@RequestBody HrCompensationSimulateRequest request) {
        return R.ok(simulationService.simulate(request));
    }
}

/**
 * HR-P1-3 绩效面谈记录端点。
 */
@RestController
@RequestMapping("/performance/interviews")
@RequiredArgsConstructor
class HrPerformanceInterviewController {

    private final HrTypedCrudService crudService;

    @GetMapping
    @SaCheckPermission("hr:performance:view")
    public R<?> listInterviews(@RequestParam Map<String, Object> query) {
        return R.ok(crudService.list(HrPerformanceInterview.class, query));
    }

    @SysLog("新增HR绩效面谈记录")
    @PostMapping
    @SaCheckPermission("hr:performance:edit")
    public R<Long> createInterview(@RequestBody HrPerformanceInterviewPayload payload) {
        return R.ok(crudService.create(HrPerformanceInterview.class, payload));
    }

    @SysLog("修改HR绩效面谈记录")
    @PutMapping("/{id}")
    @SaCheckPermission("hr:performance:edit")
    public R<Void> updateInterview(@PathVariable Long id, @RequestBody HrPerformanceInterviewPayload payload) {
        crudService.update(HrPerformanceInterview.class, id, payload);
        return R.ok();
    }

    @SysLog("删除HR绩效面谈记录")
    @DeleteMapping("/{id}")
    @SaCheckPermission("hr:performance:edit")
    public R<Void> deleteInterview(@PathVariable Long id) {
        crudService.delete(HrPerformanceInterview.class, id);
        return R.ok();
    }

    @SysLog("确认HR绩效面谈记录")
    @PostMapping("/{id}/confirm")
    @SaCheckPermission("hr:performance:edit")
    public R<Void> confirmInterview(@PathVariable Long id) {
        crudService.updateProperties(HrPerformanceInterview.class, id, Map.of("status", "CONFIRMED"));
        return R.ok();
    }
}

/**
 * HR-P1-4 考勤异常申诉端点。
 */
@RestController
@RequestMapping("/attendance/appeals")
@RequiredArgsConstructor
class HrAttendanceAppealController {

    private final HrTypedCrudService crudService;
    private final HrAttendanceAppealService appealService;

    @GetMapping
    @SaCheckPermission("hr:attendance:list")
    public R<?> listAppeals(@RequestParam Map<String, Object> query) {
        return R.ok(crudService.page(HrAttendanceAppeal.class, query));
    }

    @GetMapping("/{id}")
    @SaCheckPermission("hr:attendance:list")
    public R<Map<String, Object>> getAppeal(@PathVariable Long id) {
        return R.ok(appealService.getDetail(id));
    }

    @SysLog("提交HR考勤异常申诉")
    @PostMapping
    @SaCheckPermission("hr:attendance:add")
    public R<Long> submitAppeal(@RequestBody HrAttendanceAppealPayload payload) {
        return R.ok(appealService.submit(payload));
    }

    @SysLog("HR考勤申诉主管审核")
    @PostMapping("/{id}/manager-review")
    @SaCheckPermission("hr:attendance:edit")
    public R<Void> managerReview(@PathVariable Long id,
                                  @RequestParam boolean pass,
                                  @RequestParam(required = false) String remark) {
        appealService.managerReview(id, pass, remark);
        return R.ok();
    }

    @SysLog("HR考勤申诉HR复核")
    @PostMapping("/{id}/hr-review")
    @SaCheckPermission("hr:attendance:edit")
    public R<Void> hrReview(@PathVariable Long id,
                             @RequestParam String finalDecision,
                             @RequestParam(required = false) String remark) {
        appealService.hrReview(id, finalDecision, remark);
        return R.ok();
    }

    @SysLog("HR考勤申诉撤回")
    @PostMapping("/{id}/cancel")
    @SaCheckPermission("hr:attendance:edit")
    public R<Void> cancelAppeal(@PathVariable Long id) {
        appealService.cancel(id);
        return R.ok();
    }
}
