package com.cloudflow.oa.controller;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.oa.domain.SysScheduleEvent;
import com.cloudflow.oa.service.ISysScheduleService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/workflow/schedule")
public class SysScheduleController {

    @Autowired
    private ISysScheduleService scheduleService;

    @GetMapping("/my-events")
    public R<List<SysScheduleEvent>> getMyEvents(@RequestParam(required = false) String start, 
                                               @RequestParam(required = false) String end) {
        return R.ok(scheduleService.getMyEvents(UserContext.getUserId(), start, end));
    }

    @PostMapping
    public R<Boolean> add(@RequestBody SysScheduleEvent event) {
        event.setCreatorId(UserContext.getUserId());
        return R.ok(scheduleService.createEvent(event));
    }
    
    @PutMapping
    public R<Boolean> edit(@RequestBody SysScheduleEvent event) {
        // TODO: Add permission check (only creator can edit?)
        return R.ok(scheduleService.updateById(event));
    }

    @DeleteMapping("/{id}")
    public R<Boolean> remove(@PathVariable Long id) {
        return R.ok(scheduleService.removeById(id));
    }
}
