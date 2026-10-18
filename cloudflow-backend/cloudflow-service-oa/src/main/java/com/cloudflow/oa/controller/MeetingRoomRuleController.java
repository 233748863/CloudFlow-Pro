package com.cloudflow.oa.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.oa.domain.MeetingRoom;
import com.cloudflow.oa.domain.dto.MeetingCommands;
import com.cloudflow.oa.domain.vo.MeetingViews;
import com.cloudflow.oa.service.impl.OaMeetingRoomRuleService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/meeting-room")
@RequiredArgsConstructor
public class MeetingRoomRuleController {
    private final OaMeetingRoomRuleService rules;

    @GetMapping("/calendars")
    @SaCheckPermission("oa:meeting:room-manage")
    public R<com.cloudflow.common.core.domain.PageResult<MeetingViews.CalendarOption>> calendars(
            @RequestParam(value = "pageNum", defaultValue = "1") int pageNum, @RequestParam(value = "pageSize", defaultValue = "50") int pageSize) {
        return R.ok(rules.calendars(pageNum, pageSize));
    }

    @PostMapping("/{id}/booking-rule/preview")
    @SaCheckPermission("oa:meeting:room-manage")
    @RepeatSubmit.Disabled
    public R<MeetingViews.RulePreview> preview(@PathVariable("id") Long id, @RequestBody MeetingCommands.Rule command) { return R.ok(rules.preview(id, command)); }

    @PutMapping("/{id}/booking-rule")
    @SaCheckPermission("oa:meeting:room-manage")
    @RepeatSubmit
    @SysLog("配置会议室预约规则")
    public R<MeetingRoom> save(@PathVariable("id") Long id, @RequestBody MeetingCommands.Rule command) { return R.ok(rules.save(id, command)); }
}
