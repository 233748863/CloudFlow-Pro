package com.cloudflow.hr.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.web.MapConverters;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.hr.domain.dto.HrAttendanceAppealPayload;
import com.cloudflow.hr.domain.dto.HrCompensationSimulateRequest;
import com.cloudflow.hr.domain.dto.HrPerformanceInterviewPayload;
import com.cloudflow.hr.domain.dto.HrResumeParsedFieldsPayload;
import com.cloudflow.hr.domain.dto.attendance.HrAttendanceCommonQueryDTO;
import com.cloudflow.hr.domain.dto.performance.HrPerformanceCommonQueryDTO;
import com.cloudflow.hr.domain.dto.recruitment.HrResumeParseDTO;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.hr.domain.entity.HrAttendanceAppeal;
import com.cloudflow.hr.domain.entity.HrPerformanceInterview;
import com.cloudflow.hr.domain.vo.attendance.HrAttendanceAppealVO;
import com.cloudflow.hr.domain.vo.compensation.HrCompensationSimulateVO;
import com.cloudflow.hr.domain.vo.performance.HrPerformanceInterviewVO;
import com.cloudflow.hr.domain.vo.recruitment.HrResumeParsedFieldVO;
import com.cloudflow.hr.service.IHrAttendanceAppealService;
import com.cloudflow.hr.service.IHrCompensationSimulationService;
import com.cloudflow.hr.service.IHrResumeParserService;
import com.cloudflow.hr.service.HrTypedCrudService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
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

import java.util.List;
import java.util.Map;

/**
 * HR-P1-1 简历解析端点。
 */
@RestController
@RequestMapping("/recruitment/resume")
@RequiredArgsConstructor
class HrResumeParseController {

    private final IHrResumeParserService hrResumeParserService;
    private final ObjectMapper objectMapper;

    @SysLog("触发HR简历解析")
    @RepeatSubmit
    @PostMapping("/parse")
    @SaCheckPermission("hr:recruitment:edit")
    public R<Long> parseResume(@Validated @RequestBody HrResumeParseDTO dto) {
        return R.ok(hrResumeParserService.parseResume(dto.getCandidateId(), dto.getResumeUrl(),
                dto.getRawText() == null ? "" : dto.getRawText()));
    }

    @GetMapping("/parsed")
    @SaCheckPermission("hr:recruitment:view")
    public R<List<HrResumeParsedFieldVO>> listParsed(@RequestParam Long candidateId) {
        return R.ok(hrResumeParserService.listParsed(candidateId));
    }

    @PutMapping("/parsed/{id}")
    @SaCheckPermission("hr:recruitment:edit")
    public R<Void> updateParsed(@PathVariable Long id, @RequestBody HrResumeParsedFieldsPayload payload) {
        hrResumeParserService.updateParsed(id, payload);
        return R.ok();
    }

    @SysLog("HR复核简历解析-确认")
    // M0-8: 防重复提交
    @RepeatSubmit
    @PostMapping("/parsed/{id}/confirm")
    @SaCheckPermission("hr:recruitment:edit")
    public R<Void> confirmParsed(@PathVariable Long id) {
        hrResumeParserService.confirmParsed(id);
        return R.ok();
    }

    @SysLog("HR复核简历解析-驳回")
    // M0-8: 防重复提交
    @RepeatSubmit
    @PostMapping("/parsed/{id}/reject")
    @SaCheckPermission("hr:recruitment:edit")
    public R<Void> rejectParsed(@PathVariable Long id, @RequestParam(required = false) String reason) {
        hrResumeParserService.rejectParsed(id, reason);
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

    private final IHrCompensationSimulationService hrCompensationSimulationService;

    @SysLog("HR薪酬模拟")
    @PostMapping("/simulate")
    @SaCheckPermission("hr:compensation:view")
    public R<HrCompensationSimulateVO> simulate(@RequestBody HrCompensationSimulateRequest request) {
        return R.ok(hrCompensationSimulationService.simulate(request));
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
    private final ObjectMapper objectMapper;

    @GetMapping
    @SaCheckPermission("hr:performance:view")
    public R<List<HrPerformanceInterviewVO>> listInterviews(@Validated @ModelAttribute HrPerformanceCommonQueryDTO query) {
        return R.ok(MapConverters.toVOList(
                crudService.list(HrPerformanceInterview.class, MapConverters.toServiceQuery(query, objectMapper)),
                HrPerformanceInterviewVO.class, objectMapper));
    }

    @SysLog("新增HR绩效面谈记录")
    @RepeatSubmit
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
    // M0-8: 防重复提交
    @RepeatSubmit
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
    private final IHrAttendanceAppealService hrAttendanceAppealService;
    private final ObjectMapper objectMapper;

    @GetMapping
    @SaCheckPermission("hr:attendance:list")
    public R<PageResult<HrAttendanceAppealVO>> listAppeals(@Validated @ModelAttribute HrAttendanceCommonQueryDTO query) {
        return R.ok(MapConverters.toPageResult(
                crudService.page(HrAttendanceAppeal.class, MapConverters.toServiceQuery(query, objectMapper)),
                HrAttendanceAppealVO.class, objectMapper));
    }

    @GetMapping("/{id}")
    @SaCheckPermission("hr:attendance:list")
    public R<HrAttendanceAppealVO> getAppeal(@PathVariable Long id) {
        return R.ok(hrAttendanceAppealService.getDetail(id));
    }

    @SysLog("提交HR考勤异常申诉")
    // M0-8: 防重复提交
    @RepeatSubmit
    @PostMapping
    @SaCheckPermission("hr:attendance:add")
    public R<Long> submitAppeal(@RequestBody HrAttendanceAppealPayload payload) {
        return R.ok(hrAttendanceAppealService.submit(payload));
    }

    @SysLog("HR考勤申诉主管审核")
    @PostMapping("/{id}/manager-review")
    @SaCheckPermission("hr:attendance:edit")
    public R<Void> managerReview(@PathVariable Long id,
                                  @RequestParam boolean pass,
                                  @RequestParam(required = false) String remark) {
        hrAttendanceAppealService.managerReview(id, pass, remark);
        return R.ok();
    }

    @SysLog("HR考勤申诉HR复核")
    @PostMapping("/{id}/hr-review")
    @SaCheckPermission("hr:attendance:edit")
    public R<Void> hrReview(@PathVariable Long id,
                             @RequestParam String finalDecision,
                             @RequestParam(required = false) String remark) {
        hrAttendanceAppealService.hrReview(id, finalDecision, remark);
        return R.ok();
    }

    @SysLog("HR考勤申诉撤回")
    // M0-8: 防重复提交
    @RepeatSubmit
    @PostMapping("/{id}/cancel")
    @SaCheckPermission("hr:attendance:edit")
    public R<Void> cancelAppeal(@PathVariable Long id) {
        hrAttendanceAppealService.cancel(id);
        return R.ok();
    }
}
