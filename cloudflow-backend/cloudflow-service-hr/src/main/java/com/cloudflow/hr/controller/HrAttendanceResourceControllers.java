package com.cloudflow.hr.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import cn.dev33.satoken.annotation.SaMode;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.excel.utils.ExcelUtil;
import com.cloudflow.hr.domain.dto.HrHRequests.*;
import com.cloudflow.hr.domain.vo.attendance.HrHViews.*;
import com.cloudflow.hr.service.HrOvertimeService;
import com.cloudflow.hr.service.HrOvertimeTypeService;
import com.cloudflow.hr.service.HrOvertimeSettlementService;
import com.cloudflow.hr.service.HrShiftRequestService;
import jakarta.validation.Valid;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.bind.annotation.RequestHeader;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.web.MapConverters;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.hr.domain.dto.HrAttendanceRecordPayload;
import com.cloudflow.hr.domain.dto.HrAttendanceRulePayload;
import com.cloudflow.hr.domain.dto.HrLeaveQuotaPayload;
import com.cloudflow.hr.domain.dto.HrLeaveTypePayload;
import com.cloudflow.hr.domain.dto.HrScheduleAssignmentPayload;
import com.cloudflow.hr.domain.dto.HrShiftPayload;
import com.cloudflow.hr.domain.dto.HrTimeRequestPayload;
import com.cloudflow.hr.domain.dto.attendance.HrAttendanceCommonQueryDTO;
import com.cloudflow.hr.domain.entity.HrAttendanceMonthly;
import com.cloudflow.hr.domain.entity.HrAttendanceRecord;
import com.cloudflow.hr.domain.entity.HrAttendanceRule;
import com.cloudflow.hr.domain.entity.HrLeaveQuota;
import com.cloudflow.hr.domain.entity.HrLeaveType;
import com.cloudflow.hr.domain.entity.HrScheduleAssignment;
import com.cloudflow.hr.domain.entity.HrShift;
import com.cloudflow.hr.domain.entity.HrTimeRequest;
import com.cloudflow.hr.domain.vo.attendance.HrAttendanceMonthlyVO;
import com.cloudflow.hr.domain.vo.attendance.HrAttendanceAppealVO;
import com.cloudflow.hr.domain.vo.attendance.HrAttendanceRecordVO;
import com.cloudflow.hr.domain.vo.attendance.HrAttendanceRuleVO;
import com.cloudflow.hr.domain.vo.attendance.HrLeaveQuotaVO;
import com.cloudflow.hr.domain.vo.attendance.HrLeaveTypeVO;
import com.cloudflow.hr.domain.vo.attendance.HrScheduleAssignmentVO;
import com.cloudflow.hr.domain.vo.attendance.HrShiftVO;
import com.cloudflow.hr.domain.vo.attendance.HrTimeRequestVO;
import com.cloudflow.hr.service.HrTypedCrudService;
import com.cloudflow.hr.service.HrAttendanceRecordQueryService;
import com.cloudflow.hr.service.HrLeaveBusinessService;
import com.cloudflow.hr.service.HrAttendanceBusinessService;
import com.cloudflow.hr.service.HrRuleAsyncExecutor;
import com.cloudflow.hr.domain.dto.HrAttendanceCheckinPayload;
import com.cloudflow.hr.domain.dto.HrAttendanceRecalcRequest;
import com.cloudflow.hr.domain.entity.HrAttendanceCheckin;
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
import java.time.LocalDate;
import java.time.YearMonth;

@RestController
@RequestMapping("/attendance/overtime-requests")
@RequiredArgsConstructor
class HrOvertimeRequestController {
    private final HrOvertimeService service;
    private final HrOvertimeSettlementService settlement;

    @GetMapping("/mine")
    @SaCheckPermission("hr:overtime:mine")
    public R<PageResult<OvertimeListVO>> mine(@Valid @ModelAttribute OvertimeQuery query) { return R.ok(service.list(query, true)); }

    @GetMapping
    @SaCheckPermission("hr:overtime:list")
    public R<PageResult<OvertimeListVO>> list(@Valid @ModelAttribute OvertimeQuery query) { return R.ok(service.list(query, false)); }

    @GetMapping("/{id}")
    @SaCheckPermission(value = {"hr:overtime:mine", "hr:overtime:list"}, mode = SaMode.OR)
    public R<OvertimeDetailVO> detail(@PathVariable Long id) { return R.ok(service.detail(id)); }

    @GetMapping("/options")
    @SaCheckPermission("hr:overtime:apply")
    public R<OvertimeOptionsVO> options() { return R.ok(service.options()); }

    @PostMapping("/preview")
    @RepeatSubmit.Disabled
    @SysLog(value = "预览加班申请", logParams = false)
    @SaCheckPermission("hr:overtime:apply")
    public R<OvertimePreviewVO> preview(@RequestBody @Valid OvertimeDraftDTO input) { return R.ok(service.preview(input)); }

    @PostMapping
    @RepeatSubmit.Disabled
    @SysLog(value = "创建独立加班申请", logParams = false)
    @SaCheckPermission("hr:overtime:apply")
    public R<OvertimeDetailVO> create(@RequestHeader("Idempotency-Key") String key, @RequestBody @Valid OvertimeDraftDTO input) { return R.ok(service.create(input, key)); }

    @PutMapping("/{id}")
    @RepeatSubmit
    @SysLog(value = "修改加班草稿", logParams = false)
    @SaCheckPermission("hr:overtime:apply")
    public R<OvertimeDetailVO> update(@PathVariable Long id, @RequestBody @Valid OvertimeDraftDTO input) { return R.ok(service.update(id, input)); }

    @DeleteMapping("/{id}")
    @RepeatSubmit
    @SysLog(value = "删除加班草稿", logParams = false)
    @SaCheckPermission("hr:overtime:apply")
    public R<Void> delete(@PathVariable Long id, @RequestParam Integer version) { service.delete(id, version); return R.ok(); }

    @PostMapping("/{id}/submit")
    @RepeatSubmit
    @SysLog(value = "提交加班核定", logParams = false)
    @SaCheckPermission("hr:overtime:apply")
    public R<OvertimeDetailVO> submit(@PathVariable Long id, @RequestBody @Valid VersionDTO input) { return R.ok(service.submit(id, input)); }

    @PostMapping("/{id}/cancel")
    @RepeatSubmit
    @SysLog(value = "撤回加班申请", logParams = false)
    @SaCheckPermission("hr:overtime:cancel")
    public R<OvertimeDetailVO> cancel(@PathVariable Long id, @RequestBody @Valid ReasonVersionDTO input) { return R.ok(service.cancel(id, input)); }

    @PostMapping("/{id}/review-hours")
    @RepeatSubmit
    @SysLog(value = "核定加班分钟", logParams = false)
    @SaCheckPermission("hr:overtime:verify")
    public R<OvertimeDetailVO> reviewHours(@PathVariable Long id, @RequestBody @Valid OvertimeHoursReviewDTO input) { return R.ok(service.reviewHours(id, input)); }

    @PostMapping("/{id}/review-pay")
    @RepeatSubmit
    @SysLog(value = "核价加班费", logParams = false)
    @SaCheckPermission("hr:overtime:price")
    public R<OvertimeDetailVO> reviewPay(@PathVariable Long id, @RequestBody @Valid OvertimePayReviewDTO input) { return R.ok(service.reviewPay(id, input)); }

    @PostMapping("/{id}/review-reject")
    @RepeatSubmit
    @SysLog(value = "拒绝加班核定", logParams = false)
    @SaCheckPermission("hr:overtime:verify")
    public R<OvertimeDetailVO> reviewReject(@PathVariable Long id, @RequestBody @Valid ReasonVersionDTO input) { return R.ok(service.reviewReject(id, input)); }

    @GetMapping("/{id}/settlement")
    @SysLog(value = "读取加班结算依据", logParams = false)
    @SaCheckPermission(value = {"hr:overtime:mine", "hr:overtime:finance", "hr:overtime:verify"}, mode = SaMode.OR)
    public R<OvertimeSettlementVO> settlement(@PathVariable Long id) { return R.ok(settlement.detail(id)); }

    @PostMapping("/{id}/settlement/retry")
    @RepeatSubmit
    @SysLog(value = "重试加班结算", logParams = false)
    @SaCheckPermission("hr:overtime:retry")
    public R<OvertimeSettlementVO> retry(@PathVariable Long id, @RequestBody @Valid ReasonVersionDTO input) { return R.ok(settlement.retry(id, input)); }

    @PostMapping("/{id}/settlement/resolve")
    @RepeatSubmit
    @SysLog(value = "处置加班结算异常", logParams = false)
    @SaCheckPermission("hr:overtime:resolve")
    public R<OvertimeSettlementVO> resolve(@PathVariable Long id, @RequestBody @Valid OvertimeResolutionDTO input) { return R.ok(settlement.resolve(id, input)); }

    @GetMapping("/export")
    @SysLog(value = "导出加班台账", logParams = false)
    @SaCheckPermission("hr:overtime:export")
    public void export(@Valid @ModelAttribute OvertimeQuery query, HttpServletResponse response) { ExcelUtil.exportExcel(service.export(query, false), "加班申请", OvertimeExportVO.class, response); }

    @GetMapping("/mine/export")
    @SysLog(value = "导出本人加班记录", logParams = false)
    @SaCheckPermission("hr:overtime:mine")
    public void exportMine(@Valid @ModelAttribute OvertimeQuery query, HttpServletResponse response) { ExcelUtil.exportExcel(service.export(query, true), "本人加班", OvertimeExportVO.class, response); }
}

@RestController
@RequestMapping("/attendance/overtime-types")
@RequiredArgsConstructor
class HrOvertimeTypeController {
    private final HrOvertimeTypeService service;
    @GetMapping
    @SaCheckPermission("hr:overtime-type:list")
    public R<List<OvertimeTypeVO>> list() { return R.ok(service.list()); }
    @GetMapping("/{id}")
    @SaCheckPermission("hr:overtime-type:list")
    public R<OvertimeTypeVO> detail(@PathVariable Long id) { return R.ok(service.detail(id)); }
    @PostMapping
    @RepeatSubmit
    @SysLog(value = "新增停用加班类型", logParams = false)
    @SaCheckPermission("hr:overtime-type:add")
    public R<OvertimeTypeVO> create(@RequestBody @Valid OvertimeTypeDTO input) { return R.ok(service.save(null, input)); }
    @PutMapping("/{id}")
    @RepeatSubmit
    @SysLog(value = "修改加班类型", logParams = false)
    @SaCheckPermission("hr:overtime-type:edit")
    public R<OvertimeTypeVO> update(@PathVariable Long id, @RequestBody @Valid OvertimeTypeDTO input) { return R.ok(service.save(id, input)); }
    @PostMapping("/{id}/status")
    @RepeatSubmit
    @SysLog(value = "启停加班类型", logParams = false)
    @SaCheckPermission("hr:overtime-type:edit")
    public R<OvertimeTypeVO> status(@PathVariable Long id, @RequestBody @Valid OvertimeTypeStatusDTO input) { return R.ok(service.changeStatus(id, input)); }
}

@RestController
@RequestMapping("/attendance/shift-requests")
@RequiredArgsConstructor
class HrShiftRequestController {
    private final HrShiftRequestService service;
    @GetMapping("/mine")
    @SaCheckPermission("hr:shift-request:mine")
    public R<PageResult<ShiftRequestVO>> mine(@Valid @ModelAttribute ShiftRequestQuery query) { return R.ok(service.list(query, true)); }
    @GetMapping
    @SaCheckPermission("hr:shift-request:list")
    public R<PageResult<ShiftRequestVO>> list(@Valid @ModelAttribute ShiftRequestQuery query) { return R.ok(service.list(query, false)); }
    @GetMapping("/{id}")
    @SaCheckPermission(value = {"hr:shift-request:mine", "hr:shift-request:list"}, mode = SaMode.OR)
    public R<ShiftRequestDetailVO> detail(@PathVariable Long id) { return R.ok(service.detail(id)); }
    @GetMapping("/invitations")
    @SaCheckPermission("hr:shift-request:respond")
    public R<PageResult<ShiftInvitationVO>> invitations(@Valid @ModelAttribute ShiftRequestQuery query) { return R.ok(service.invitations(query)); }
    @GetMapping("/invitations/{id}")
    @SaCheckPermission("hr:shift-request:respond")
    public R<ShiftInvitationVO> invitation(@PathVariable Long id) { return R.ok(service.invitation(id)); }
    @GetMapping("/options")
    @SaCheckPermission("hr:shift-request:apply")
    public R<ShiftOptionsVO> options(@RequestParam @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE) LocalDate attendanceDate) { return R.ok(service.options(attendanceDate)); }
    @PostMapping("/preview")
    @RepeatSubmit.Disabled
    @SysLog(value = "预览调班方案", logParams = false)
    @SaCheckPermission("hr:shift-request:apply")
    public R<ShiftPreviewVO> preview(@RequestBody @Valid ShiftDraftDTO input) { return R.ok(service.preview(input)); }
    @PostMapping
    @RepeatSubmit.Disabled
    @SysLog(value = "创建调班草稿", logParams = false)
    @SaCheckPermission("hr:shift-request:apply")
    public R<ShiftRequestDetailVO> create(@RequestHeader("Idempotency-Key") String key, @RequestBody @Valid ShiftDraftDTO input) { return R.ok(service.create(input, key)); }
    @PutMapping("/{id}")
    @RepeatSubmit
    @SysLog(value = "修改调班草稿", logParams = false)
    @SaCheckPermission("hr:shift-request:apply")
    public R<ShiftRequestDetailVO> update(@PathVariable Long id, @RequestBody @Valid ShiftDraftDTO input) { return R.ok(service.update(id, input)); }
    @DeleteMapping("/{id}")
    @RepeatSubmit
    @SysLog(value = "删除调班草稿", logParams = false)
    @SaCheckPermission("hr:shift-request:apply")
    public R<Void> delete(@PathVariable Long id, @RequestParam Integer version) { service.delete(id, version); return R.ok(); }
    @PostMapping("/{id}/submit")
    @RepeatSubmit
    @SysLog(value = "提交调班申请", logParams = false)
    @SaCheckPermission("hr:shift-request:apply")
    public R<ShiftRequestDetailVO> submit(@PathVariable Long id, @RequestBody @Valid VersionDTO input) { return R.ok(service.submit(id, input)); }
    @PostMapping("/{id}/respond")
    @RepeatSubmit
    @SysLog(value = "回应换班邀请", logParams = false)
    @SaCheckPermission("hr:shift-request:respond")
    public R<ShiftInvitationVO> respond(@PathVariable Long id, @RequestBody @Valid ShiftResponseDTO input) { return R.ok(service.respond(id, input)); }
    @PostMapping("/{id}/cancel")
    @RepeatSubmit
    @SysLog(value = "撤回调班申请", logParams = false)
    @SaCheckPermission("hr:shift-request:cancel")
    public R<ShiftRequestDetailVO> cancel(@PathVariable Long id, @RequestBody @Valid ReasonVersionDTO input) { return R.ok(service.cancel(id, input)); }
    @PostMapping("/{id}/application/retry")
    @RepeatSubmit
    @SysLog(value = "重试调班应用", logParams = false)
    @SaCheckPermission("hr:shift-request:retry")
    public R<ShiftRequestDetailVO> retry(@PathVariable Long id, @RequestBody @Valid ReasonVersionDTO input) { return R.ok(service.retry(id, input)); }
}

@RestController
@RequestMapping("/attendance")
@RequiredArgsConstructor
class HrShiftController {

    private final HrTypedCrudService crudService;
    private final HrAttendanceBusinessService attendanceService;
    private final ObjectMapper objectMapper;

    @GetMapping("/shifts")
    @SaCheckPermission("hr:attendance:list")
    public R<List<HrShiftVO>> listShifts(@Validated @ModelAttribute HrAttendanceCommonQueryDTO query) {
        return R.ok(MapConverters.toVOList(
                crudService.list(HrShift.class, MapConverters.toServiceQuery(query, objectMapper)),
                HrShiftVO.class, objectMapper));
    }

    @SysLog("新增HR班次")
    @RepeatSubmit
    @PostMapping("/shifts")
    @SaCheckPermission("hr:attendance:add")
    public R<Long> createShift(@RequestBody HrShiftPayload payload) {
        return R.ok(attendanceService.saveShift(null, payload));
    }

    @SysLog("修改HR班次")
    @RepeatSubmit
    @PutMapping("/shifts/{id}")
    @SaCheckPermission("hr:attendance:edit")
    public R<Void> updateShift(@PathVariable Long id, @RequestBody HrShiftPayload payload) {
        attendanceService.saveShift(id, payload);
        return R.ok();
    }

    @SysLog("删除HR班次")
    @RepeatSubmit
    @DeleteMapping("/shifts/{id}")
    @SaCheckPermission("hr:attendance:remove")
    public R<Void> deleteShift(@PathVariable Long id) {
        attendanceService.deleteConfiguration("shift", id);
        return R.ok();
    }
}

@RestController
@RequestMapping("/attendance")
@RequiredArgsConstructor
class HrAttendanceRuleController {

    private final HrTypedCrudService crudService;
    private final HrAttendanceBusinessService attendanceService;
    private final ObjectMapper objectMapper;

    @GetMapping("/rules")
    @SaCheckPermission("hr:attendance:list")
    public R<List<HrAttendanceRuleVO>> listRules(@Validated @ModelAttribute HrAttendanceCommonQueryDTO query) {
        return R.ok(MapConverters.toVOList(
                crudService.list(HrAttendanceRule.class, MapConverters.toServiceQuery(query, objectMapper)),
                HrAttendanceRuleVO.class, objectMapper));
    }

    @SysLog("新增HR考勤规则")
    @RepeatSubmit
    @PostMapping("/rules")
    @SaCheckPermission("hr:attendance:add")
    public R<Long> createRule(@RequestBody HrAttendanceRulePayload payload) {
        return R.ok(attendanceService.saveRule(null, payload));
    }

    @SysLog("修改HR考勤规则")
    @RepeatSubmit
    @PutMapping("/rules/{id}")
    @SaCheckPermission("hr:attendance:edit")
    public R<Void> updateRule(@PathVariable Long id, @RequestBody HrAttendanceRulePayload payload) {
        attendanceService.saveRule(id, payload);
        return R.ok();
    }

    @SysLog("删除HR考勤规则")
    @RepeatSubmit
    @DeleteMapping("/rules/{id}")
    @SaCheckPermission("hr:attendance:remove")
    public R<Void> deleteRule(@PathVariable Long id) {
        attendanceService.deleteConfiguration("rule", id);
        return R.ok();
    }
}

@RestController
@RequestMapping("/attendance")
@RequiredArgsConstructor
class HrScheduleAssignmentController {

    private final HrTypedCrudService crudService;
    private final HrAttendanceBusinessService attendanceService;
    private final ObjectMapper objectMapper;

    @GetMapping("/schedules")
    @SaCheckPermission("hr:attendance:list")
    public R<List<HrScheduleAssignmentVO>> listSchedules(@Validated @ModelAttribute HrAttendanceCommonQueryDTO query) {
        return R.ok(MapConverters.toVOList(
                crudService.list(HrScheduleAssignment.class, MapConverters.toServiceQuery(query, objectMapper)),
                HrScheduleAssignmentVO.class, objectMapper));
    }

    @SysLog("新增HR排班")
    @RepeatSubmit
    @PostMapping("/schedules")
    @SaCheckPermission("hr:attendance:add")
    public R<Long> createSchedule(@RequestBody HrScheduleAssignmentPayload payload) {
        return R.ok(attendanceService.saveSchedule(null, payload));
    }

    @SysLog("修改HR排班")
    @RepeatSubmit
    @PutMapping("/schedules/{id}")
    @SaCheckPermission("hr:attendance:edit")
    public R<Void> updateSchedule(@PathVariable Long id, @RequestBody HrScheduleAssignmentPayload payload) {
        attendanceService.saveSchedule(id, payload);
        return R.ok();
    }

    @SysLog("删除HR排班")
    @RepeatSubmit
    @DeleteMapping("/schedules/{id}")
    @SaCheckPermission("hr:attendance:remove")
    public R<Void> deleteSchedule(@PathVariable Long id) {
        attendanceService.deleteConfiguration("schedule", id);
        return R.ok();
    }
}

@RestController
@RequestMapping("/attendance")
@RequiredArgsConstructor
class HrAttendanceRecordController {

    private final HrAttendanceRecordQueryService recordQueries;
    private final HrAttendanceBusinessService attendanceService;
    private final HrRuleAsyncExecutor asyncExecutor;
    private final com.cloudflow.hr.service.HrHAttendanceSummaryService hSummary;
    @GetMapping("/records")
    @SaCheckPermission("hr:attendance:list")
    public R<List<HrAttendanceRecordVO>> listRecords(@Validated @ModelAttribute HrAttendanceCommonQueryDTO query) {
        return R.ok(hSummary.records(recordQueries.list(query)));
    }

    @GetMapping("/records/page")
    @SaCheckPermission("hr:attendance:list")
    public R<PageResult<HrAttendanceRecordVO>> pageRecords(@Validated @ModelAttribute HrAttendanceCommonQueryDTO query) {
        PageResult<HrAttendanceRecordVO> result = recordQueries.page(query);
        result.setRows(hSummary.records(result.getRows()));
        return R.ok(result);
    }

    @SysLog("新增HR考勤记录")
    @RepeatSubmit
    @PostMapping("/records")
    @SaCheckPermission("hr:attendance:add")
    public R<Long> createRecord(@RequestBody HrAttendanceRecordPayload payload) {
        return R.ok(attendanceService.createManualRecord(payload));
    }

    @GetMapping("/checkins")
    @SaCheckPermission("hr:attendance:list")
    public R<List<HrAttendanceCheckin>> checkins(@RequestParam Long employeeId, @RequestParam LocalDate from, @RequestParam LocalDate to) {
        return R.ok(attendanceService.checkins(employeeId, from, to));
    }

    @SysLog("录入原始考勤打卡")
    @RepeatSubmit
    @PostMapping("/checkins")
    @SaCheckPermission("hr:attendance:add")
    public R<Long> checkin(@RequestBody HrAttendanceCheckinPayload payload) {
        return R.ok(attendanceService.checkin(payload));
    }

    @GetMapping("/records/calculate")
    @SaCheckPermission("hr:attendance:list")
    public R<HrAttendanceRecord> calculate(@RequestParam Long employeeId, @RequestParam LocalDate date) {
        return R.ok(attendanceService.calculate(employeeId, date));
    }

    @SysLog("范围重算考勤")
    @RepeatSubmit
    @PostMapping("/recalculate")
    @SaCheckPermission("hr:attendance:recalculate")
    public R<Map<String, Object>> recalculate(@RequestBody HrAttendanceRecalcRequest payload) {
        return R.ok(attendanceService.requestRecalculation(payload));
    }

    @GetMapping("/tasks/{executeNo}")
    @SaCheckPermission("hr:attendance:recalculate")
    public R<com.cloudflow.common.job.model.JobResult> task(@PathVariable String executeNo) {
        return R.ok(asyncExecutor.status(executeNo));
    }

    @SysLog("人工调整日考勤")
    @RepeatSubmit
    @PutMapping("/records/{id}/adjust")
    @SaCheckPermission("hr:attendance:adjust")
    public R<Void> adjust(@PathVariable Long id, @RequestBody HrAttendanceRecordPayload payload) {
        attendanceService.adjust(id, payload);
        return R.ok();
    }
}

@RestController
@RequestMapping("/attendance")
@RequiredArgsConstructor
class HrAttendanceMonthlyController {

    private final HrTypedCrudService crudService;
    private final HrAttendanceBusinessService attendanceService;
    private final com.cloudflow.hr.service.HrHAttendanceSummaryService hSummary;
    private final ObjectMapper objectMapper;

    @GetMapping("/monthly")
    @SaCheckPermission("hr:attendance:list")
    public R<List<HrAttendanceMonthlyVO>> listMonthly(@Validated @ModelAttribute HrAttendanceCommonQueryDTO query) {
        return R.ok(hSummary.months(MapConverters.toVOList(
                crudService.list(HrAttendanceMonthly.class, MapConverters.toServiceQuery(query, objectMapper)),
                HrAttendanceMonthlyVO.class, objectMapper)));
    }

    @SysLog("汇总月度考勤")
    @RepeatSubmit
    @PostMapping("/monthly/summarize")
    @SaCheckPermission("hr:attendance:recalculate")
    public R<HrAttendanceMonthly> summarize(@RequestParam Long employeeId, @RequestParam YearMonth month) {
        return R.ok(attendanceService.summarizeMonth(employeeId, month, false));
    }

    @SysLog("确认月度考勤封账")
    @RepeatSubmit
    @PostMapping("/monthly/confirm")
    @SaCheckPermission("hr:attendance:confirm")
    public R<HrAttendanceMonthly> confirm(@RequestParam Long employeeId, @RequestParam YearMonth month) {
        return R.ok(attendanceService.summarizeMonth(employeeId, month, true));
    }
}

@RestController
@RequestMapping("/attendance")
@RequiredArgsConstructor
class HrLeaveTypeController {

    private final HrTypedCrudService crudService;
    private final com.cloudflow.hr.service.HrLeaveConfigurationService leaveConfigurationService;
    private final ObjectMapper objectMapper;

    @GetMapping("/leave-types")
    @SaCheckPermission("hr:attendance:list")
    public R<List<HrLeaveTypeVO>> listLeaveTypes(@Validated @ModelAttribute HrAttendanceCommonQueryDTO query) {
        return R.ok(MapConverters.toVOList(
                crudService.list(HrLeaveType.class, MapConverters.toServiceQuery(query, objectMapper)),
                HrLeaveTypeVO.class, objectMapper));
    }

    @SysLog("新增HR假期类型")
    @RepeatSubmit
    @PostMapping("/leave-types")
    @SaCheckPermission("hr:attendance:add")
    public R<Long> createLeaveType(@RequestBody HrLeaveTypePayload payload) {
        return R.ok(leaveConfigurationService.saveType(null, payload));
    }

    @SysLog("修改假期类型规则")
    @RepeatSubmit
    @PutMapping("/leave-types/{id}")
    @SaCheckPermission("hr:leave:configure")
    public R<Long> updateLeaveType(@PathVariable Long id, @RequestBody HrLeaveTypePayload payload) {
        return R.ok(leaveConfigurationService.saveType(id, payload));
    }
}

@RestController
@RequestMapping("/attendance")
@RequiredArgsConstructor
class HrLeaveQuotaController {

    private final HrTypedCrudService crudService;
    private final HrLeaveBusinessService leaveBusinessService;
    private final ObjectMapper objectMapper;

    @GetMapping("/leave-quotas")
    @SaCheckPermission("hr:attendance:list")
    public R<List<HrLeaveQuotaVO>> listLeaveQuotas(@Validated @ModelAttribute HrAttendanceCommonQueryDTO query) {
        return R.ok(MapConverters.toVOList(
                crudService.list(HrLeaveQuota.class, MapConverters.toServiceQuery(query, objectMapper)),
                HrLeaveQuotaVO.class, objectMapper));
    }

    @SysLog("新增HR假期额度")
    @RepeatSubmit
    @PostMapping("/leave-quotas")
    @SaCheckPermission("hr:attendance:add")
    public R<Long> createLeaveQuota(@RequestBody HrLeaveQuotaPayload payload) {
        return R.ok(leaveBusinessService.createQuota(payload));
    }

    @SysLog("修改HR假期额度")
    @PutMapping("/leave-quotas/{id}")
    @SaCheckPermission("hr:attendance:edit")
    public R<Void> updateLeaveQuota(@PathVariable Long id, @RequestBody HrLeaveQuotaPayload payload) {
        leaveBusinessService.updateQuota(id, payload);
        return R.ok();
    }
}

@RestController
@RequestMapping("/attendance")
@RequiredArgsConstructor
class HrTimeRequestController {

    private final HrTypedCrudService crudService;
    private final HrLeaveBusinessService leaveBusinessService;
    private final ObjectMapper objectMapper;

    @GetMapping("/time-requests")
    @SaCheckPermission("hr:attendance:list")
    public R<List<HrTimeRequestVO>> listTimeRequests(@Validated @ModelAttribute HrAttendanceCommonQueryDTO query) {
        return R.ok(MapConverters.toVOList(
                crudService.list(HrTimeRequest.class, MapConverters.toServiceQuery(query, objectMapper)),
                HrTimeRequestVO.class, objectMapper));
    }

    @SysLog("新增HR时间申请")
    @RepeatSubmit
    @PostMapping("/time-requests")
    @SaCheckPermission("hr:attendance:add")
    public R<Long> createTimeRequest(@RequestBody HrTimeRequestPayload payload) {
        if (payload != null && (payload.getRequestType() == null || "LEAVE".equalsIgnoreCase(payload.getRequestType()))) {
            return R.ok(leaveBusinessService.submit(payload));
        }
        return R.ok(crudService.create(HrTimeRequest.class, payload));
    }

    @SysLog("修改HR时间申请")
    @PutMapping("/time-requests/{id}")
    @SaCheckPermission("hr:attendance:edit")
    public R<Void> updateTimeRequest(@PathVariable Long id, @RequestBody HrTimeRequestPayload payload) {
        leaveBusinessService.updateRequest(id, payload);
        return R.ok();
    }

    @SysLog("删除HR时间申请")
    @DeleteMapping("/time-requests/{id}")
    @SaCheckPermission("hr:attendance:remove")
    public R<Void> deleteTimeRequest(@PathVariable Long id) {
        leaveBusinessService.deleteRequest(id);
        return R.ok();
    }

    @SysLog("变更HR时间申请状态")
    @RepeatSubmit
    @PostMapping("/time-requests/{id}/{action}")
    @SaCheckPermission("hr:attendance:edit")
    public R<Void> changeTimeRequestStatus(@PathVariable Long id, @PathVariable String action) {
        leaveBusinessService.changeRequestStatus(id, action);
        return R.ok();
    }

    @GetMapping("/leave-days")
    @SaCheckPermission("hr:attendance:list")
    public R<java.math.BigDecimal> calculateLeaveDays(@org.springframework.web.bind.annotation.RequestParam Long employeeId,
                                                      @org.springframework.web.bind.annotation.RequestParam Long leaveTypeId,
                                                      @org.springframework.web.bind.annotation.RequestParam String startTime,
                                                      @org.springframework.web.bind.annotation.RequestParam String endTime) {
        return R.ok(leaveBusinessService.calculate(employeeId, leaveTypeId,
                java.time.LocalDateTime.parse(startTime), java.time.LocalDateTime.parse(endTime)));
    }

    @GetMapping("/time-requests/{id}/files")
    @SaCheckPermission("hr:attendance:list")
    public R<List<Map<String, Object>>> files(@PathVariable Long id) {
        return R.ok(leaveBusinessService.attachments(id));
    }

    @GetMapping("/time-requests/{id}/files/{fileId}")
    @SaCheckPermission("hr:attendance:list")
    public org.springframework.http.ResponseEntity<byte[]> download(@PathVariable Long id, @PathVariable Long fileId) {
        return leaveBusinessService.downloadAttachment(id, fileId);
    }
}

@RestController
@RequestMapping("/attendance/leave")
@RequiredArgsConstructor
class HrLeavePolicyController {
    private final com.cloudflow.hr.service.HrLeaveConfigurationService configuration;
    private final HrLeaveBusinessService leaveService;

    @GetMapping("/{resource:periods|policies|policy-details|policy-assignments|earned-schedules}")
    @SaCheckPermission("hr:leave:list")
    public R<List<Map<String, Object>>> list(@PathVariable String resource,
            @org.springframework.web.bind.annotation.RequestParam Map<String, Object> query) {
        return R.ok(configuration.list(resource, query));
    }

    @SysLog("新增假期周期")
    @RepeatSubmit
    @PostMapping("/periods")
    @SaCheckPermission("hr:leave:configure")
    public R<Long> createPeriod(@RequestBody com.cloudflow.hr.domain.entity.HrLeavePeriod payload) {
        return R.ok(configuration.savePeriod(null, payload));
    }

    @SysLog("修改假期周期")
    @PutMapping("/periods/{id}")
    @SaCheckPermission("hr:leave:configure")
    public R<Long> updatePeriod(@PathVariable Long id, @RequestBody com.cloudflow.hr.domain.entity.HrLeavePeriod payload) {
        return R.ok(configuration.savePeriod(id, payload));
    }

    @SysLog("新增假期政策")
    @RepeatSubmit
    @PostMapping("/policies")
    @SaCheckPermission("hr:leave:configure")
    public R<Long> createPolicy(@RequestBody com.cloudflow.hr.domain.entity.HrLeavePolicy payload) {
        return R.ok(configuration.savePolicy(null, payload));
    }

    @SysLog("修改假期政策")
    @PutMapping("/policies/{id}")
    @SaCheckPermission("hr:leave:configure")
    public R<Long> updatePolicy(@PathVariable Long id, @RequestBody com.cloudflow.hr.domain.entity.HrLeavePolicy payload) {
        return R.ok(configuration.savePolicy(id, payload));
    }

    @SysLog("配置假期政策明细")
    @PutMapping("/policies/{id}/details")
    @SaCheckPermission("hr:leave:configure")
    public R<Void> saveDetails(@PathVariable Long id, @RequestBody List<com.cloudflow.hr.domain.entity.HrLeavePolicyDetail> details) {
        configuration.saveDetails(id, details);
        return R.ok();
    }

    @SysLog("批量分配假期政策")
    @RepeatSubmit
    @PostMapping("/assignments")
    @SaCheckPermission("hr:leave:assign")
    public R<Integer> assign(@RequestBody com.cloudflow.hr.domain.dto.HrLeavePolicyAssignRequest payload) {
        return R.ok(configuration.assign(payload));
    }

    @GetMapping("/ledger")
    @SaCheckPermission("hr:leave:list")
    public R<List<Map<String, Object>>> ledger(@org.springframework.web.bind.annotation.RequestParam Long employeeId,
            @org.springframework.web.bind.annotation.RequestParam Long leaveTypeId,
            @org.springframework.web.bind.annotation.RequestParam(required = false) Long periodId) {
        return R.ok(leaveService.ledger(employeeId, leaveTypeId, periodId));
    }

    @SysLog("追加假期台账")
    @RepeatSubmit
    @PostMapping("/ledger")
    @SaCheckPermission("hr:leave:adjust")
    public R<Long> createEntry(@RequestBody com.cloudflow.hr.domain.dto.HrLeaveLedgerEntryRequest payload) {
        return R.ok(leaveService.postLedger(payload));
    }

    @SysLog("冲正假期台账")
    @RepeatSubmit
    @PostMapping("/ledger/{id}/reverse")
    @SaCheckPermission("hr:leave:adjust")
    public R<Long> reverse(@PathVariable Long id, @RequestBody Map<String, String> payload) {
        return R.ok(leaveService.reverseLedger(id, payload.get("reason")));
    }

    @SysLog("重算假期额度")
    @RepeatSubmit
    @PostMapping("/recalculate")
    @SaCheckPermission("hr:leave:adjust")
    public R<Integer> recalculate(@org.springframework.web.bind.annotation.RequestParam(required = false) Long employeeId,
                                 @org.springframework.web.bind.annotation.RequestParam(required = false) Long leaveTypeId) {
        return R.ok(leaveService.recalculate(employeeId, leaveTypeId));
    }
}

@RestController
@RequestMapping("/ess/leave")
@RequiredArgsConstructor
class HrEssLeaveController {
    private final com.cloudflow.hr.service.HrEssSupport essSupport;
    private final HrLeaveBusinessService leaveService;
    private final HrTypedCrudService crudService;
    private final com.cloudflow.hr.service.HrRuleProofService proofService;

    @GetMapping("/{id}/files")
    @SaCheckPermission("hr:leave:mine")
    public R<List<Map<String, Object>>> files(@PathVariable Long id) {
        assertRequestOwner(id);
        return R.ok(leaveService.attachments(id));
    }

    @GetMapping("/{id}/files/{fileId}")
    @SaCheckPermission("hr:leave:mine")
    public org.springframework.http.ResponseEntity<byte[]> download(@PathVariable Long id, @PathVariable Long fileId) {
        assertRequestOwner(id);
        return leaveService.downloadAttachment(id, fileId);
    }

    private void assertRequestOwner(Long id) {
        Map<String, Object> request = crudService.get(HrTimeRequest.class, id);
        essSupport.assertOwner(((Number) request.get("employeeId")).longValue());
    }

    @GetMapping("/types")
    @SaCheckPermission("hr:leave:mine")
    public R<List<Map<String, Object>>> types() {
        essSupport.currentEmployeeId();
        return R.ok(crudService.list(HrLeaveType.class, Map.of()));
    }

    @SysLog(value = "上传本人请假证明", logParams = false)
    @RepeatSubmit
    @PostMapping("/files")
    @SaCheckPermission("hr:leave:mine")
    public R<Map<String, Object>> uploadProof(@RequestParam("file") org.springframework.web.multipart.MultipartFile file) {
        essSupport.currentEmployeeId();
        return R.ok(proofService.upload(file, "HR_LEAVE_PROOF"));
    }

    @GetMapping("/mine")
    @SaCheckPermission("hr:leave:mine")
    public R<List<HrTimeRequest>> mine() {
        return R.ok(leaveService.ownRequests(essSupport.currentEmployeeId()));
    }

    @GetMapping("/quotas")
    @SaCheckPermission("hr:leave:mine")
    public R<List<HrLeaveQuota>> quotas() {
        return R.ok(leaveService.ownQuotas(essSupport.currentEmployeeId()));
    }

    @GetMapping("/calculate")
    @SaCheckPermission("hr:leave:mine")
    public R<java.math.BigDecimal> calculate(@org.springframework.web.bind.annotation.RequestParam Long leaveTypeId,
            @org.springframework.web.bind.annotation.RequestParam String startTime,
            @org.springframework.web.bind.annotation.RequestParam String endTime) {
        return R.ok(leaveService.calculate(essSupport.currentEmployeeId(), leaveTypeId,
                java.time.LocalDateTime.parse(startTime), java.time.LocalDateTime.parse(endTime)));
    }

    @SysLog("员工提交请假")
    @RepeatSubmit
    @PostMapping
    @SaCheckPermission("hr:leave:mine")
    public R<Long> submit(@RequestBody HrTimeRequestPayload payload) {
        payload.setEmployeeId(essSupport.currentEmployeeId());
        return R.ok(leaveService.submit(payload));
    }

    @SysLog("员工撤回请假")
    @RepeatSubmit
    @PostMapping("/{id}/cancel")
    @SaCheckPermission("hr:leave:mine")
    public R<Void> cancel(@PathVariable Long id) {
        Map<String, Object> request = crudService.get(HrTimeRequest.class, id);
        essSupport.assertOwner(((Number) request.get("employeeId")).longValue());
        leaveService.revoke(id);
        return R.ok();
    }
}

@RestController
@RequestMapping("/ess/attendance")
@RequiredArgsConstructor
class HrEssAttendanceController {
    private final com.cloudflow.hr.service.HrEssSupport essSupport;
    private final HrAttendanceBusinessService attendanceService;
    private final com.cloudflow.hr.service.IHrAttendanceAppealService appealService;
    private final com.cloudflow.hr.service.HrAttendancePhotoService photos;

    @GetMapping("/today")
    @SaCheckPermission("hr:attendance:mine")
    public R<HrAttendanceBusinessService.TodayAttendance> today() {
        return R.ok(attendanceService.today(essSupport.currentEmployeeId()));
    }

    @PostMapping("/photos")
    @SaCheckPermission("hr:attendance:mine")
    public R<com.cloudflow.hr.service.HrAttendancePhotoService.Uploaded> uploadPhoto(
            @RequestParam("file") org.springframework.web.multipart.MultipartFile file) {
        return R.ok(photos.upload(file, essSupport.currentEmployeeId()));
    }

    @GetMapping("/photos/{fileId}")
    @SaCheckPermission("hr:attendance:mine")
    public org.springframework.http.ResponseEntity<byte[]> photo(@PathVariable Long fileId) {
        essSupport.currentEmployeeId();
        return photos.download(fileId);
    }

    @GetMapping("/records")
    @SaCheckPermission("hr:attendance:mine")
    public R<List<HrAttendanceRecordVO>> records() {
        return R.ok(attendanceService.ownRecords(essSupport.currentEmployeeId()));
    }

    @GetMapping("/checkins")
    @SaCheckPermission("hr:attendance:mine")
    public R<List<HrAttendanceCheckin>> checkins(@RequestParam LocalDate from, @RequestParam LocalDate to) {
        return R.ok(attendanceService.checkins(essSupport.currentEmployeeId(), from, to));
    }

    @SysLog("员工本人打卡")
    @RepeatSubmit
    @PostMapping("/checkins")
    @SaCheckPermission("hr:attendance:mine")
    public R<Long> checkin(@RequestBody HrAttendanceCheckinPayload payload) {
        payload.setEmployeeId(essSupport.currentEmployeeId());
        payload.setCheckTime(java.time.LocalDateTime.now());
        payload.setCheckMethod("APP");
        payload.setSkipAutoFlag(0);
        payload.setShiftId(null);
        return R.ok(attendanceService.checkin(payload));
    }

    @GetMapping("/appeals")
    @SaCheckPermission("hr:attendance:mine")
    public R<List<HrAttendanceAppealVO>> appeals() {
        return R.ok(appealService.ownAppeals());
    }

    @SysLog("员工提交考勤申诉")
    @RepeatSubmit
    @PostMapping("/appeals")
    @SaCheckPermission("hr:attendance:mine")
    public R<Long> submitAppeal(@RequestBody com.cloudflow.hr.domain.dto.HrAttendanceAppealPayload payload) {
        payload.setEmployeeId(essSupport.currentEmployeeId());
        return R.ok(appealService.submit(payload));
    }

    @SysLog("员工撤回考勤申诉")
    @RepeatSubmit
    @PostMapping("/appeals/{id}/cancel")
    @SaCheckPermission("hr:attendance:mine")
    public R<Void> cancelAppeal(@PathVariable Long id) {
        appealService.cancel(id);
        return R.ok();
    }
}
