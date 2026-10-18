package com.cloudflow.auth.controller;

import com.cloudflow.auth.service.HolidayManagementService;
import com.cloudflow.auth.domain.vo.DayTypeVO;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.security.annotation.Inner;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

/** 跨服务节假日查询内部接口。 */
@RestController
@RequestMapping("/inner/holiday")
@RequiredArgsConstructor
public class HolidayInnerController {
    private final HolidayManagementService service;

    @Inner
    @GetMapping("/date-type")
    public R<DayTypeVO> dateType(@RequestParam Long calendarId, @RequestParam String date) {
        return R.ok(service.dateType(calendarId, LocalDate.parse(date)));
    }

    @Inner
    @GetMapping("/month")
    public R<List<DayTypeVO>> month(@RequestParam Long calendarId, @RequestParam Integer year,
                                    @RequestParam Integer month) {
        return R.ok(service.month(calendarId, year, month));
    }

    @Inner
    @GetMapping("/is-workday")
    public R<Boolean> isWorkday(@RequestParam Long calendarId, @RequestParam String date) {
        return R.ok(service.isWorkday(calendarId, LocalDate.parse(date)));
    }

    @Inner
    @GetMapping("/count-workdays")
    public R<Integer> countWorkdays(@RequestParam Long calendarId, @RequestParam String startDate,
                                    @RequestParam String endDate) {
        return R.ok(service.countWorkdays(calendarId, LocalDate.parse(startDate), LocalDate.parse(endDate)));
    }

    @Inner
    @GetMapping("/next-workday")
    public R<String> nextWorkday(@RequestParam Long calendarId, @RequestParam String date, @RequestParam Integer n) {
        return R.ok(service.nextWorkday(calendarId, LocalDate.parse(date), n).toString());
    }

    @Inner
    @GetMapping("/resolve-calendar")
    public R<Long> resolveCalendar(@RequestParam Long employeeId, @RequestParam String date) {
        return R.ok(service.resolveCalendar(employeeId, LocalDate.parse(date)));
    }
}
