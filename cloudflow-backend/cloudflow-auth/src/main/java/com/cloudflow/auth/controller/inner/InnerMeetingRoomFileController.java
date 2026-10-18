package com.cloudflow.auth.controller.inner;

import com.cloudflow.auth.domain.SysFile;
import com.cloudflow.auth.service.ISysFileService;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.security.annotation.Inner;
import jakarta.servlet.http.HttpServletResponse;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/inner/auth/meeting-room-files")
@RequiredArgsConstructor
public class InnerMeetingRoomFileController {
    private final ISysFileService files;

    @PostMapping(value = "/{roomId}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Inner(allowedServices = "cloudflow-service-oa")
    @RepeatSubmit.Disabled
    public R<Map<String, Object>> upload(@PathVariable("roomId") Long roomId, @RequestPart("file") MultipartFile file) {
        SysFile stored = files.uploadMeetingRoomPhoto(file, roomId);
        return R.ok(Map.of("fileId", stored.getFileId().toString(), "fileName", stored.getFileName(),
                "size", stored.getFileSize(), "extension", stored.getFileType()));
    }

    @GetMapping("/{roomId}/{fileId}/content")
    @Inner(allowedServices = "cloudflow-service-oa")
    public void content(@PathVariable("roomId") Long roomId, @PathVariable("fileId") Long fileId, HttpServletResponse response) {
        files.copyMeetingRoomPhoto(roomId, fileId, response);
    }
}
