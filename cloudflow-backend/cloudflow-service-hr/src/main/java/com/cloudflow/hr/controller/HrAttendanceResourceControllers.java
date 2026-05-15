package com.cloudflow.hr.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.hr.domain.dto.HrAttendanceRecordPayload;
import com.cloudflow.hr.domain.dto.HrAttendanceRulePayload;
import com.cloudflow.hr.domain.dto.HrLeaveQuotaPayload;
import com.cloudflow.hr.domain.dto.HrLeaveTypePayload;
import com.cloudflow.hr.domain.dto.HrScheduleAssignmentPayload;
import com.cloudflow.hr.domain.dto.HrShiftPayload;
import com.cloudflow.hr.domain.dto.HrTimeRequestPayload;
import com.cloudflow.hr.domain.entity.HrAttendanceMonthly;
import com.cloudflow.hr.domain.entity.HrAttendanceRecord;
import com.cloudflow.hr.domain.entity.HrAttendanceRule;
import com.cloudflow.hr.domain.entity.HrLeaveQuota;
import com.cloudflow.hr.domain.entity.HrLeaveType;
import com.cloudflow.hr.domain.entity.HrScheduleAssignment;
import com.cloudflow.hr.domain.entity.HrShift;
import com.cloudflow.hr.domain.entity.HrTimeRequest;
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

import java.util.Map;

@RestController
@RequestMapping("/attendance")
@RequiredArgsConstructor
class HrShiftController {

    private final HrTypedCrudService crudService;

    @GetMapping("/shifts")
    @SaCheckPermission("hr:attendance:list")
    public R<?> listShifts(@RequestParam Map<String, Object> query) {
        return R.ok(crudService.list(HrShift.class, query));
    }

    @SysLog("新增HR班次")
    @PostMapping("/shifts")
    @SaCheckPermission("hr:attendance:add")
    public R<Long> createShift(@RequestBody HrShiftPayload payload) {
        return R.ok(crudService.create(HrShift.class, payload));
    }

    @SysLog("修改HR班次")
    @PutMapping("/shifts/{id}")
    @SaCheckPermission("hr:attendance:edit")
    public R<Void> updateShift(@PathVariable Long id, @RequestBody HrShiftPayload payload) {
        crudService.update(HrShift.class, id, payload);
        return R.ok();
    }

    @SysLog("删除HR班次")
    @DeleteMapping("/shifts/{id}")
    @SaCheckPermission("hr:attendance:remove")
    public R<Void> deleteShift(@PathVariable Long id) {
        crudService.delete(HrShift.class, id);
        return R.ok();
    }
}

@RestController
@RequestMapping("/attendance")
@RequiredArgsConstructor
class HrAttendanceRuleController {

    private final HrTypedCrudService crudService;

    @GetMapping("/rules")
    @SaCheckPermission("hr:attendance:list")
    public R<?> listRules(@RequestParam Map<String, Object> query) {
        return R.ok(crudService.list(HrAttendanceRule.class, query));
    }

    @SysLog("新增HR考勤规则")
    @PostMapping("/rules")
    @SaCheckPermission("hr:attendance:add")
    public R<Long> createRule(@RequestBody HrAttendanceRulePayload payload) {
        return R.ok(crudService.create(HrAttendanceRule.class, payload));
    }

    @SysLog("修改HR考勤规则")
    @PutMapping("/rules/{id}")
    @SaCheckPermission("hr:attendance:edit")
    public R<Void> updateRule(@PathVariable Long id, @RequestBody HrAttendanceRulePayload payload) {
        crudService.update(HrAttendanceRule.class, id, payload);
        return R.ok();
    }

    @SysLog("删除HR考勤规则")
    @DeleteMapping("/rules/{id}")
    @SaCheckPermission("hr:attendance:remove")
    public R<Void> deleteRule(@PathVariable Long id) {
        crudService.delete(HrAttendanceRule.class, id);
        return R.ok();
    }
}

@RestController
@RequestMapping("/attendance")
@RequiredArgsConstructor
class HrScheduleAssignmentController {

    private final HrTypedCrudService crudService;

    @GetMapping("/schedules")
    @SaCheckPermission("hr:attendance:list")
    public R<?> listSchedules(@RequestParam Map<String, Object> query) {
        return R.ok(crudService.list(HrScheduleAssignment.class, query));
    }

    @SysLog("新增HR排班")
    @PostMapping("/schedules")
    @SaCheckPermission("hr:attendance:add")
    public R<Long> createSchedule(@RequestBody HrScheduleAssignmentPayload payload) {
        return R.ok(crudService.create(HrScheduleAssignment.class, payload));
    }

    @SysLog("修改HR排班")
    @PutMapping("/schedules/{id}")
    @SaCheckPermission("hr:attendance:edit")
    public R<Void> updateSchedule(@PathVariable Long id, @RequestBody HrScheduleAssignmentPayload payload) {
        crudService.update(HrScheduleAssignment.class, id, payload);
        return R.ok();
    }

    @SysLog("删除HR排班")
    @DeleteMapping("/schedules/{id}")
    @SaCheckPermission("hr:attendance:remove")
    public R<Void> deleteSchedule(@PathVariable Long id) {
        crudService.delete(HrScheduleAssignment.class, id);
        return R.ok();
    }
}

@RestController
@RequestMapping("/attendance")
@RequiredArgsConstructor
class HrAttendanceRecordController {

    private final HrTypedCrudService crudService;

    @GetMapping("/records")
    @SaCheckPermission("hr:attendance:list")
    public R<?> listRecords(@RequestParam Map<String, Object> query) {
        return R.ok(crudService.list(HrAttendanceRecord.class, query));
    }

    @SysLog("新增HR考勤记录")
    @PostMapping("/records")
    @SaCheckPermission("hr:attendance:add")
    public R<Long> createRecord(@RequestBody HrAttendanceRecordPayload payload) {
        return R.ok(crudService.create(HrAttendanceRecord.class, payload));
    }
}

@RestController
@RequestMapping("/attendance")
@RequiredArgsConstructor
class HrAttendanceMonthlyController {

    private final HrTypedCrudService crudService;

    @GetMapping("/monthly")
    @SaCheckPermission("hr:attendance:list")
    public R<?> listMonthly(@RequestParam Map<String, Object> query) {
        return R.ok(crudService.list(HrAttendanceMonthly.class, query));
    }
}

@RestController
@RequestMapping("/attendance")
@RequiredArgsConstructor
class HrLeaveTypeController {

    private final HrTypedCrudService crudService;

    @GetMapping("/leave-types")
    @SaCheckPermission("hr:attendance:list")
    public R<?> listLeaveTypes(@RequestParam Map<String, Object> query) {
        return R.ok(crudService.list(HrLeaveType.class, query));
    }

    @SysLog("新增HR假期类型")
    @PostMapping("/leave-types")
    @SaCheckPermission("hr:attendance:add")
    public R<Long> createLeaveType(@RequestBody HrLeaveTypePayload payload) {
        return R.ok(crudService.create(HrLeaveType.class, payload));
    }
}

@RestController
@RequestMapping("/attendance")
@RequiredArgsConstructor
class HrLeaveQuotaController {

    private final HrTypedCrudService crudService;

    @GetMapping("/leave-quotas")
    @SaCheckPermission("hr:attendance:list")
    public R<?> listLeaveQuotas(@RequestParam Map<String, Object> query) {
        return R.ok(crudService.list(HrLeaveQuota.class, query));
    }

    @SysLog("新增HR假期额度")
    @PostMapping("/leave-quotas")
    @SaCheckPermission("hr:attendance:add")
    public R<Long> createLeaveQuota(@RequestBody HrLeaveQuotaPayload payload) {
        return R.ok(crudService.create(HrLeaveQuota.class, payload));
    }

    @SysLog("修改HR假期额度")
    @PutMapping("/leave-quotas/{id}")
    @SaCheckPermission("hr:attendance:edit")
    public R<Void> updateLeaveQuota(@PathVariable Long id, @RequestBody HrLeaveQuotaPayload payload) {
        crudService.update(HrLeaveQuota.class, id, payload);
        return R.ok();
    }
}

@RestController
@RequestMapping("/attendance")
@RequiredArgsConstructor
class HrTimeRequestController {

    private final HrTypedCrudService crudService;

    @GetMapping("/time-requests")
    @SaCheckPermission("hr:attendance:list")
    public R<?> listTimeRequests(@RequestParam Map<String, Object> query) {
        return R.ok(crudService.list(HrTimeRequest.class, query));
    }

    @SysLog("新增HR时间申请")
    @PostMapping("/time-requests")
    @SaCheckPermission("hr:attendance:add")
    public R<Long> createTimeRequest(@RequestBody HrTimeRequestPayload payload) {
        return R.ok(crudService.create(HrTimeRequest.class, payload));
    }

    @SysLog("修改HR时间申请")
    @PutMapping("/time-requests/{id}")
    @SaCheckPermission("hr:attendance:edit")
    public R<Void> updateTimeRequest(@PathVariable Long id, @RequestBody HrTimeRequestPayload payload) {
        crudService.update(HrTimeRequest.class, id, payload);
        return R.ok();
    }

    @SysLog("删除HR时间申请")
    @DeleteMapping("/time-requests/{id}")
    @SaCheckPermission("hr:attendance:remove")
    public R<Void> deleteTimeRequest(@PathVariable Long id) {
        crudService.delete(HrTimeRequest.class, id);
        return R.ok();
    }

    @SysLog("变更HR时间申请状态")
    @PostMapping("/time-requests/{id}/{action}")
    @SaCheckPermission("hr:attendance:edit")
    public R<Void> changeTimeRequestStatus(@PathVariable Long id, @PathVariable String action) {
        crudService.changeStatus(HrTimeRequest.class, id, action);
        return R.ok();
    }
}
