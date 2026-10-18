package com.cloudflow.oa.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import cn.dev33.satoken.annotation.SaMode;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.oa.service.impl.OaMeetingRoomPhotoService;
import jakarta.servlet.http.HttpServletResponse;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/meeting-room/{roomId}/photo")
@RequiredArgsConstructor
public class MeetingRoomPhotoController {
    private final OaMeetingRoomPhotoService photos;

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @SaCheckPermission("oa:meeting:room-manage")
    @RepeatSubmit
    @SysLog("上传会议室私有照片")
    public R<Map<String, Object>> upload(@PathVariable("roomId") Long roomId, @RequestPart("file") MultipartFile file) {
        return R.ok(photos.upload(roomId, file));
    }

    @GetMapping
    @SaCheckPermission(value = {"oa:meeting:board", "oa:meeting:mine", "oa:meeting-room:list"}, mode = SaMode.OR)
    public void content(@PathVariable("roomId") Long roomId, HttpServletResponse response) { photos.content(roomId, response); }
}
