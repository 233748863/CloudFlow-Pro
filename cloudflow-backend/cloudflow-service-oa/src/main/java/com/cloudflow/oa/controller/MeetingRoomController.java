package com.cloudflow.oa.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.oa.domain.MeetingRoom;
import com.cloudflow.oa.service.IMeetingRoomService;
import org.springframework.beans.factory.annotation.Autowired;
import cn.dev33.satoken.annotation.SaCheckPermission;
import cn.dev33.satoken.annotation.SaCheckRole;
import cn.dev33.satoken.annotation.SaMode;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/meeting-room")
public class MeetingRoomController {

    @Autowired
    private IMeetingRoomService meetingRoomService;

    @GetMapping("/list")
    @SaCheckPermission("oa:meeting-room:list")
    public R<List<MeetingRoom>> list() {
        return R.ok(meetingRoomService.list());
    }

    @GetMapping("/{id}")
    @SaCheckPermission("oa:meeting-room:list")
    public R<MeetingRoom> getById(@PathVariable("id") Long id) {
        return R.ok(meetingRoomService.getById(id));
    }

    @SysLog("新增会议室")
    @PostMapping
    @SaCheckPermission("oa:meeting-room:add")
    public R<Boolean> add(@RequestBody MeetingRoom meetingRoom) {
        return R.ok(meetingRoomService.save(meetingRoom));
    }

    @SysLog("编辑会议室")
    @PutMapping
    @SaCheckPermission("oa:meeting-room:edit")
    public R<Boolean> edit(@RequestBody MeetingRoom meetingRoom) {
        return R.ok(meetingRoomService.updateById(meetingRoom));
    }

    @SysLog("删除会议室")
    @DeleteMapping("/{id}")
    @SaCheckPermission("oa:meeting-room:remove")
    public R<Boolean> remove(@PathVariable("id") Long id) {
        return R.ok(meetingRoomService.removeById(id));
    }
}


