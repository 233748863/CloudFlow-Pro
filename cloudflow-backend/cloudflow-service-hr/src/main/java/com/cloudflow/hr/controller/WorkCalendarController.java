package com.cloudflow.hr.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.domain.dto.WorkCalendarDTO;
import com.cloudflow.hr.domain.dto.WorkCalendarQueryDTO;
import com.cloudflow.hr.domain.vo.WorkCalendarVO;
import com.cloudflow.hr.service.WorkCalendarService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@Slf4j
@RestController
@RequestMapping("/work-calendar")
@RequiredArgsConstructor
public class WorkCalendarController {

    private final WorkCalendarService workCalendarService;

    @GetMapping
    public R<List<WorkCalendarVO>> listWorkCalendars(WorkCalendarQueryDTO query) {
        return R.ok(workCalendarService.listWorkCalendars(query));
    }

    @PostMapping
    public R<Long> createWorkCalendar(@Valid @RequestBody WorkCalendarDTO dto) {
        return R.ok(workCalendarService.createWorkCalendar(dto));
    }

    @PutMapping("/{id}")
    public R<Void> updateWorkCalendar(@PathVariable Long id, @Valid @RequestBody WorkCalendarDTO dto) {
        workCalendarService.updateWorkCalendar(id, dto);
        return R.ok();
    }

    @DeleteMapping("/{id}")
    public R<Void> deleteWorkCalendar(@PathVariable Long id) {
        workCalendarService.deleteWorkCalendar(id);
        return R.ok();
    }
}
