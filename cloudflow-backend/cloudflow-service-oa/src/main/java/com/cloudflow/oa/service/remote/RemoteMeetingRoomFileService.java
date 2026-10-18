package com.cloudflow.oa.service.remote;

import com.cloudflow.common.core.domain.R;
import feign.Response;
import java.util.Map;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.multipart.MultipartFile;

@FeignClient(name = "cloudflow-auth", path = "/inner/auth/meeting-room-files", contextId = "meetingRoomFiles")
public interface RemoteMeetingRoomFileService {
    @PostMapping(value = "/{roomId}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    R<Map<String, Object>> upload(@PathVariable("roomId") Long roomId, @RequestPart("file") MultipartFile file);

    @GetMapping("/{roomId}/{fileId}/content")
    Response content(@PathVariable("roomId") Long roomId, @PathVariable("fileId") Long fileId);
}
