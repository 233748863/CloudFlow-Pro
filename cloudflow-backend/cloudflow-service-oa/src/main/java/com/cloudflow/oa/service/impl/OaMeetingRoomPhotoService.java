package com.cloudflow.oa.service.impl;

import cn.dev33.satoken.stp.StpUtil;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.core.exception.StorageCapacityError;
import com.cloudflow.common.core.file.FilePreviewBinding;
import com.cloudflow.common.core.file.FilePreviewReferences;
import com.cloudflow.common.core.file.FilePreviewRequest;
import com.cloudflow.common.security.file.FilePreviewAccess;
import com.cloudflow.oa.domain.MeetingRoom;
import com.cloudflow.oa.mapper.MeetingRoomMapper;
import com.cloudflow.oa.mapper.OaMeetingMapper;
import com.cloudflow.oa.service.remote.RemoteMeetingRoomFileService;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.io.InputStream;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.cloud.client.circuitbreaker.NoFallbackAvailableException;
import org.springframework.core.NestedExceptionUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
@RequiredArgsConstructor
@Transactional(propagation = Propagation.NOT_SUPPORTED)
public class OaMeetingRoomPhotoService {
    private final MeetingRoomMapper rooms;
    private final OaMeetingMapper meetings;
    private final RemoteMeetingRoomFileService storage;

    @Audit(name = "上传会议室照片")
    public Map<String, Object> upload(Long roomId, MultipartFile file) {
        if (!StpUtil.hasPermission("oa:meeting:room-manage")) throw new ServiceException("无会议室照片维护权限", 403);
        room(roomId);
        try {
            R<Map<String, Object>> result = storage.upload(roomId, file);
            if (result == null || !result.isSuccess() || result.getData() == null) throw unavailable();
            Map<String, Object> data = result.getData();
            Long fileId = Long.valueOf(String.valueOf(data.get("fileId")));
            room(roomId);
            if (meetings.photoAllowed(OaRecordSupport.tenantId(), roomId, fileId) != 1) throw unavailable();
            return Map.of("fileId", fileId.toString(), "fileName", data.get("fileName"), "size", data.get("size"), "extension", data.get("extension"));
        } catch (feign.FeignException | NoFallbackAvailableException failure) {
            Throwable cause = NestedExceptionUtils.getMostSpecificCause(failure);
            if (cause instanceof feign.FeignException upstream && StorageCapacityError.matches(upstream.status(), upstream.contentUTF8())) {
                throw StorageCapacityError.exception();
            }
            if (cause instanceof feign.FeignException upstream && (upstream.status() == 400 || upstream.status() == 413)) {
                throw new ServiceException("照片须为PNG或JPEG，且大小符合文件上传配置", 400);
            }
            throw unavailable();
        } catch (NumberFormatException failure) { throw unavailable(); }
    }

    public FilePreviewBinding authorizeDownload(FilePreviewRequest request) {
        FilePreviewAccess.requireSession();
        request.validated();
        if (!"OA_MEETING_ROOM".equals(request.bizType()) || List.of("oa:meeting:board", "oa:meeting:mine", "oa:meeting-room:list")
                .stream().noneMatch(StpUtil::hasPermission)) throw FilePreviewReferences.denied();
        MeetingRoom room = readablePhoto(request.businessId());
        String reference = "/api/auth/system/file/" + room.getPhotoFileId() + "/content";
        return new FilePreviewBinding(FilePreviewReferences.choose(request, List.of(reference)), String.valueOf(room.getVersion()));
    }

    private MeetingRoom readablePhoto(Long roomId) {
        MeetingRoom room = room(roomId);
        if (room.getPhotoFileId() == null || meetings.photoAllowed(OaRecordSupport.tenantId(), roomId, room.getPhotoFileId()) != 1) {
            throw new ServiceException("会议室尚未设置有效照片", 404);
        }
        return room;
    }

    public void content(Long roomId, HttpServletResponse response) {
        MeetingRoom room = readablePhoto(roomId);
        try (feign.Response upstream = storage.content(roomId, room.getPhotoFileId())) {
            if (upstream == null || upstream.status() != 200 || upstream.body() == null) throw unavailable();
            String type = upstream.headers().entrySet().stream().filter(header -> "Content-Type".equalsIgnoreCase(header.getKey()))
                    .flatMap(header -> header.getValue().stream()).findFirst().orElse("");
            if (!List.of("image/png", "image/jpeg").contains(type)) throw unavailable();
            response.setContentType(type);
            response.setHeader("Cache-Control", "private, no-store");
            response.setHeader("X-Content-Type-Options", "nosniff");
            response.setHeader("Referrer-Policy", "no-referrer");
            try (InputStream content = upstream.body().asInputStream()) { content.transferTo(response.getOutputStream()); }
        } catch (IOException | feign.FeignException | NoFallbackAvailableException failure) { throw unavailable(); }
    }

    private MeetingRoom room(Long id) {
        MeetingRoom room = id == null ? null : rooms.selectById(id);
        if (room == null || !Objects.equals(room.getTenantId(), OaRecordSupport.tenantId()) || !Integer.valueOf(0).equals(room.getDeleted())) {
            throw new ServiceException("会议室不存在或无权访问", 404);
        }
        return room;
    }

    private ServiceException unavailable() { return new ServiceException("会议室照片存储暂不可用，请稍后重试", 503); }
}
