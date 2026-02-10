package com.cloudflow.oa.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.oa.domain.MeetingRoom;
import com.cloudflow.oa.service.IMeetingRoomService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/meeting-room")
public class MeetingRoomController {

    @Autowired
    private IMeetingRoomService meetingRoomService;

    @GetMapping("/list")
    public R<List<MeetingRoom>> list() {
        return R.ok(meetingRoomService.list());
    }

    @PostMapping
    public R<Boolean> add(@RequestBody MeetingRoom meetingRoom) {
        return R.ok(meetingRoomService.save(meetingRoom));
    }

    @PutMapping
    public R<Boolean> edit(@RequestBody MeetingRoom meetingRoom) {
        return R.ok(meetingRoomService.updateById(meetingRoom));
    }

    @DeleteMapping("/{id}")
    public R<Boolean> remove(@PathVariable("id") Long id) {
        return R.ok(meetingRoomService.removeById(id));
    }
}
