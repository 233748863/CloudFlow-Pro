package com.cloudflow.oa.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.oa.domain.dto.MeetingCommands;
import com.cloudflow.oa.domain.vo.MeetingViews;
import com.cloudflow.oa.service.impl.OaMeetingSeriesService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/meeting/series")
@RequiredArgsConstructor
public class MeetingSeriesController {
    private final OaMeetingSeriesService series;

    @PostMapping("/preview")
    @SaCheckPermission("oa:meeting:series")
    @RepeatSubmit.Disabled
    public R<MeetingViews.SeriesPreview> preview(@RequestParam(value = "id", required = false) Long id, @RequestBody MeetingCommands.Booking command) {
        return R.ok(series.preview(id, command));
    }

    @PostMapping
    @SaCheckPermission("oa:meeting:series")
    @RepeatSubmit
    @SysLog("创建本人周期会议")
    public R<MeetingViews.SeriesResult> create(@RequestBody MeetingCommands.Booking command) { return R.ok(series.create(command)); }

    @PutMapping("/{id}")
    @SaCheckPermission("oa:meeting:series")
    @RepeatSubmit
    @SysLog("修改本人周期会议")
    public R<MeetingViews.SeriesResult> update(@PathVariable("id") Long id, @RequestBody MeetingCommands.Booking command) { return R.ok(series.update(id, command)); }
}
