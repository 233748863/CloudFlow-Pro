package com.cloudflow.hr.service;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.utils.file.FileUploadUtils;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrFileStorageMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.MediaTypeFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.util.Map;

import static com.cloudflow.hr.service.HrRuleSupport.tenantId;

@Service
@RequiredArgsConstructor
public class HrAttendancePhotoService {
    static final String PURPOSE = "HR_ATTENDANCE_PHOTO";
    static final long MAX_SIZE = 5L * 1024 * 1024;
    private final HrFileStorage storage;
    private final HrFileStorageMapper files;
    private final HrRuleSupport support;

    public record Uploaded(Long fileId, String fileName) { }

    public Uploaded upload(MultipartFile file, Long employeeId) {
        FileUploadUtils.ValidatedFile validated;
        byte[] bytes;
        try {
            validated = FileUploadUtils.validate(file, MAX_SIZE, new String[]{"jpg", "jpeg", "png", "webp"});
            bytes = file.getBytes();
            if (bytes.length == 0 || bytes.length > MAX_SIZE || bytes.length != file.getSize()) {
                throw new IllegalArgumentException("照片大小无效");
            }
        } catch (Exception failure) {
            throw new HrBusinessException("INVALID_ATTENDANCE_PHOTO", "请选择内容与扩展名一致且不超过5MiB的JPG、PNG或WebP照片");
        }
        return support.transaction(() -> {
            Long fileId = storage.save(bytes, validated.originalFileName(), PURPOSE);
            support.audit(PURPOSE, fileId, "UPLOAD", Map.of("employeeId", employeeId, "fileSize", bytes.length));
            return new Uploaded(fileId, validated.originalFileName());
        });
    }

    public void assertOwned(Long fileId) {
        if (fileId == null) return;
        String owner = UserContext.getUserName();
        if (owner == null || owner.isBlank() || files.countOwnedProof(tenantId(), owner, fileId, PURPOSE) != 1) {
            throw new HrBusinessException("ATTENDANCE_PHOTO_FORBIDDEN", "只能使用本人在当前租户上传的考勤照片");
        }
    }

    public ResponseEntity<byte[]> download(Long fileId) {
        if (fileId == null) throw new HrBusinessException("INVALID_ATTENDANCE_PHOTO", "照片编号不能为空");
        assertOwned(fileId);
        String name = storage.fileName(fileId, PURPOSE);
        return ResponseEntity.ok().contentType(MediaTypeFactory.getMediaType(name).orElse(MediaType.APPLICATION_OCTET_STREAM))
                .header(HttpHeaders.CONTENT_DISPOSITION, org.springframework.http.ContentDisposition.attachment()
                        .filename(name, java.nio.charset.StandardCharsets.UTF_8).build().toString())
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .header("X-Content-Type-Options", "nosniff")
                .header("Content-Security-Policy", "default-src 'none'; sandbox")
                .body(storage.loadPrivate(fileId, PURPOSE));
    }
}
