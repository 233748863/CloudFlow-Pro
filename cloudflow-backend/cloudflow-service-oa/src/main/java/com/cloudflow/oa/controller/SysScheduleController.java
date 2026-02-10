package com.cloudflow.oa.controller;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.oa.domain.SysScheduleEvent;
import com.cloudflow.oa.service.ISysScheduleService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;

@RestController
@RequestMapping("/schedule")
public class SysScheduleController {

    @Autowired
    private ISysScheduleService scheduleService;

    @GetMapping("/my-events")
    public R<List<SysScheduleEvent>> getMyEvents(@RequestParam(value = "start", required = false) String start,
                                               @RequestParam(value = "end", required = false) String end) {
        return R.ok(scheduleService.getMyEvents(UserContext.getUserId(), start, end));
    }

    /**
     * 获取今日日程
     */
    @GetMapping("/today")
    public R<List<SysScheduleEvent>> getTodaySchedule() {
        String today = LocalDate.now().format(DateTimeFormatter.ISO_LOCAL_DATE);
        return R.ok(scheduleService.getMyEvents(UserContext.getUserId(), today, today));
    }

    @PostMapping
    public R<Boolean> add(@RequestBody SysScheduleEvent event) {
        event.setCreatorId(UserContext.getUserId());
        return R.ok(scheduleService.createEvent(event));
    }
    
    @PutMapping
    public R<Boolean> edit(@RequestBody SysScheduleEvent event) {
        // 权限检查：只有创建者可以编辑日程
        Long currentUserId = UserContext.getUserId();
        SysScheduleEvent existing = scheduleService.getById(event.getEventId());
        if (existing == null) {
            return R.fail("日程不存在");
        }
        if (!currentUserId.equals(existing.getCreatorId())) {
            return R.fail("无权编辑此日程，只有创建者可以编辑");
        }
        return R.ok(scheduleService.updateById(event));
    }

    @DeleteMapping("/{id}")
    public R<Boolean> remove(@PathVariable("id") Long id) {
        // 权限检查：只有创建者可以删除日程
        Long currentUserId = UserContext.getUserId();
        SysScheduleEvent existing = scheduleService.getById(id);
        if (existing == null) {
            return R.fail("日程不存在");
        }
        if (!currentUserId.equals(existing.getCreatorId())) {
            return R.fail("无权删除此日程，只有创建者可以删除");
        }
        return R.ok(scheduleService.removeById(id));
    }
}
