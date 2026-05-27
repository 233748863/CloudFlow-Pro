package com.cloudflow.oa.controller;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.oa.domain.SysScheduleEvent;
import com.cloudflow.oa.domain.vo.DynamicMapVO;
import com.cloudflow.oa.service.ISysScheduleService;
import org.springframework.beans.factory.annotation.Autowired;
import cn.dev33.satoken.annotation.SaCheckPermission;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;

@RestController
@RequestMapping("/schedule")
public class SysScheduleController {

    @Autowired
    private ISysScheduleService sysScheduleService;

    @GetMapping("/my-events")
    @SaCheckPermission("oa:schedule:list")
    public R<List<SysScheduleEvent>> getMyEvents(@RequestParam(value = "start", required = false) String start,
                                               @RequestParam(value = "end", required = false) String end) {
        return R.ok(sysScheduleService.getMyEvents(UserContext.getUserId(), start, end));
    }

    /**
     * 获取今日日程
     */
    @GetMapping("/today")
    @SaCheckPermission("oa:schedule:list")
    public R<List<SysScheduleEvent>> getTodaySchedule() {
        String today = LocalDate.now().format(DateTimeFormatter.ISO_LOCAL_DATE);
        return R.ok(sysScheduleService.getMyEvents(UserContext.getUserId(), today, today));
    }

    /**
     * 查询指定会议室的日程（所有人可见）
     * @param roomId 会议室ID
     * @param date 查询日期（可选，默认今天）
     */
    @GetMapping("/room/{roomId}")
    @SaCheckPermission("oa:schedule:list")
    public R<List<SysScheduleEvent>> getRoomEvents(@PathVariable("roomId") Long roomId,
                                                   @RequestParam(value = "date", required = false) String date) {
        String queryDate = (date != null && !date.isEmpty()) ? date : LocalDate.now().format(DateTimeFormatter.ISO_LOCAL_DATE);
        return R.ok(sysScheduleService.getRoomEvents(roomId, queryDate));
    }

    @SysLog("新增日程")
    @PostMapping
    @SaCheckPermission("oa:schedule:add")
    public R<Boolean> add(@RequestBody SysScheduleEvent event) {
        event.setCreatorId(UserContext.getUserId());
        return R.ok(sysScheduleService.createEvent(event));
    }
    
    @SysLog("编辑日程")
    @PutMapping
    @SaCheckPermission("oa:schedule:edit")
    public R<Boolean> edit(@RequestBody SysScheduleEvent event) {
        // 权限检查：只有创建者可以编辑日程
        Long currentUserId = UserContext.getUserId();
        SysScheduleEvent existing = sysScheduleService.getById(event.getEventId());
        if (existing == null) {
            return R.fail("日程不存在");
        }
        if (!currentUserId.equals(existing.getCreatorId())) {
            return R.fail("无权编辑此日程，只有创建者可以编辑");
        }
        return R.ok(sysScheduleService.updateById(event));
    }

    @SysLog("删除日程")
    @DeleteMapping("/{id}")
    @SaCheckPermission("oa:schedule:remove")
    public R<Boolean> remove(@PathVariable("id") Long id) {
        // 权限检查：只有创建者可以删除日程
        Long currentUserId = UserContext.getUserId();
        SysScheduleEvent existing = sysScheduleService.getById(id);
        if (existing == null) {
            return R.fail("日程不存在");
        }
        if (!currentUserId.equals(existing.getCreatorId())) {
            return R.fail("无权删除此日程，只有创建者可以删除");
        }
        return R.ok(sysScheduleService.removeById(id));
    }

    /**
     * 获取会议室一周的预订（周视图日历用）
     * @param roomId 会议室ID
     * @param weekStart 周一日期（YYYY-MM-DD格式）
     */
    @GetMapping("/room/{roomId}/week")
    @SaCheckPermission("oa:schedule:list")
    public R<List<SysScheduleEvent>> getRoomWeekEvents(@PathVariable("roomId") Long roomId,
                                                       @RequestParam("weekStart") String weekStart) {
        return R.ok(sysScheduleService.getRoomWeekEvents(roomId, weekStart));
    }

    /**
     * 获取我的会议室预订记录
     * @param status 状态筛选（可选：upcoming-待开始, past-已结束）
     */
    @GetMapping("/my-bookings")
    @SaCheckPermission("oa:schedule:list")
    public R<List<SysScheduleEvent>> getMyBookings(@RequestParam(value = "status", required = false) String status) {
        return R.ok(sysScheduleService.getMyBookings(UserContext.getUserId(), status));
    }

    /**
     * 取消预订
     * @param id 日程ID
     */
    @SysLog("取消预订")
    @PutMapping("/cancel/{id}")
    @SaCheckPermission("oa:schedule:cancel")
    public R<Boolean> cancelBooking(@PathVariable("id") Long id) {
        return R.ok(sysScheduleService.cancelBooking(id, UserContext.getUserId()));
    }

    /**
     * 会议室使用统计
     * @param startDate 开始日期（可选）
     * @param endDate 结束日期（可选）
     */
    @GetMapping("/room-stats")
    @SaCheckPermission("oa:schedule:list")
    public R<List<DynamicMapVO>> getRoomUsageStats(
            @RequestParam(value = "startDate", required = false) String startDate,
            @RequestParam(value = "endDate", required = false) String endDate) {
        return R.ok(sysScheduleService.getRoomUsageStats(startDate, endDate));
    }
}

