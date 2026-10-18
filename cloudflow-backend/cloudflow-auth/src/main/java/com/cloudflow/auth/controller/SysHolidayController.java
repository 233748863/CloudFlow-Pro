package com.cloudflow.auth.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.auth.domain.dto.HolidayCalendarDTO;
import com.cloudflow.auth.domain.dto.HolidayDateBatchDTO;
import com.cloudflow.auth.domain.vo.DayTypeVO;
import com.cloudflow.auth.domain.vo.SysHolidayDateVO;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.holiday.domain.HolidayCalendar;
import com.cloudflow.auth.service.HolidayManagementService;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import jakarta.validation.Valid;
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

import java.time.LocalDate;
import java.util.List;

/**
 * 节假日日历管理与查询。
 */
@RestController
@RequestMapping("/system/holiday")
@RequiredArgsConstructor
public class SysHolidayController {
    private final HolidayManagementService service;

    @GetMapping("/calendar/list")
    @SaCheckPermission("system:holiday:list")
    public R<PageResult<HolidayCalendar>> calendarList(@RequestParam(defaultValue = "1") Integer pageNum,
                                                       @RequestParam(defaultValue = "10") Integer pageSize) {
        return R.ok(service.list(pageNum, pageSize));
    }

    @GetMapping("/calendar/{id}")
    @SaCheckPermission("system:holiday:list")
    public R<HolidayCalendar> calendarInfo(@PathVariable Long id) { return R.ok(service.get(id)); }

    @SysLog("新增节假日日历")
    @RepeatSubmit
    @PostMapping("/calendar")
    @SaCheckPermission("system:holiday:add")
    public R<Void> addCalendar(@RequestBody @Valid HolidayCalendarDTO dto) { service.add(dto); return R.ok(); }

    @SysLog("修改节假日日历")
    @PutMapping("/calendar")
    @SaCheckPermission("system:holiday:edit")
    public R<Void> editCalendar(@RequestBody @Valid HolidayCalendarDTO dto) { service.edit(dto); return R.ok(); }

    @SysLog("删除节假日日历")
    @DeleteMapping("/calendar/{ids}")
    @SaCheckPermission("system:holiday:remove")
    public R<Void> removeCalendar(@PathVariable List<Long> ids) { service.remove(ids); return R.ok(); }

    @GetMapping("/date/list")
    @SaCheckPermission("system:holiday:list")
    public R<List<SysHolidayDateVO>> dateList(@RequestParam Long calendarId, @RequestParam Integer yearNo) {
        return R.ok(service.dates(calendarId, yearNo));
    }

    @SysLog("批量保存节假日明细")
    @RepeatSubmit
    @PostMapping("/date/batch")
    @SaCheckPermission("system:holiday:edit")
    public R<Void> batchSave(@RequestBody @Valid HolidayDateBatchDTO dto) { service.batchSave(dto); return R.ok(); }

    @SysLog("删除节假日明细")
    @DeleteMapping("/date/{ids}")
    @SaCheckPermission("system:holiday:remove")
    public R<Void> removeDates(@PathVariable List<Long> ids) { service.removeDates(ids); return R.ok(); }

    @GetMapping("/query/month")
    @SaCheckPermission("system:holiday:query")
    public R<List<DayTypeVO>> monthTypes(@RequestParam Long calendarId, @RequestParam Integer year, @RequestParam Integer month) {
        return R.ok(service.month(calendarId, year, month));
    }

    @GetMapping("/query/is-workday")
    @SaCheckPermission("system:holiday:query")
    public R<Boolean> isWorkday(@RequestParam Long calendarId, @RequestParam String date) { return R.ok(service.isWorkday(calendarId, LocalDate.parse(date))); }

    @GetMapping("/query/count-workdays")
    @SaCheckPermission("system:holiday:query")
    public R<Integer> countWorkdays(@RequestParam Long calendarId, @RequestParam String startDate, @RequestParam String endDate) { return R.ok(service.countWorkdays(calendarId, LocalDate.parse(startDate), LocalDate.parse(endDate))); }

    @GetMapping("/query/next-workday")
    @SaCheckPermission("system:holiday:query")
    public R<String> nextWorkday(@RequestParam Long calendarId, @RequestParam String date, @RequestParam Integer n) { return R.ok(service.nextWorkday(calendarId, LocalDate.parse(date), n).toString()); }

    @GetMapping("/query/date-type")
    @SaCheckPermission("system:holiday:query")
    public R<DayTypeVO> dateType(@RequestParam Long calendarId, @RequestParam String date) { return R.ok(service.dateType(calendarId, LocalDate.parse(date))); }

    @GetMapping("/query/resolve-calendar")
    @SaCheckPermission("system:holiday:query")
    public R<Long> resolveCalendar(@RequestParam Long employeeId, @RequestParam String date) { return R.ok(service.resolveCalendar(employeeId, LocalDate.parse(date))); }

}
