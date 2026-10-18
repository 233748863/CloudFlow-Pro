package com.cloudflow.hr.service;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.common.tenant.quota.TenantQuotaService;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrFileStorageMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.util.StringUtils;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * 把 PDF/电子件落地到 sys_file。本期采用本地磁盘路径作为存储载体，
 * 通过配置 {@code cloudflow.hr.storage.local-dir} 切换实际目录。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class HrFileStorage {

    private final HrFileStorageMapper fileStorageMapper;
    private final TenantQuotaService tenantQuotas;

    @Value("${cloudflow.hr.storage.local-dir:${user.home}/.cloudflow/hr/files}")
    private String baseDir;

    /**
     * 保存字节流并写 sys_file 行。
     *
     * @return sys_file.file_id
     */
    @Transactional(rollbackFor = Exception.class)
    public Long save(byte[] bytes, String originalName, String fileType) {
        if (bytes == null || bytes.length == 0) {
            throw new HrBusinessException("INVALID_PARAMETER", "文件内容为空");
        }
        Long tenantId = currentTenantId();
        tenantQuotas.requireStorageCapacity(tenantId, bytes.length);
        String safeName = StringUtils.hasText(originalName) ? originalName : "unnamed.bin";
        LocalDate today = LocalDate.now();
        String subDir = today.format(DateTimeFormatter.ofPattern("yyyy/MM"));
        String stored = UUID.randomUUID().toString().replace("-", "") + suffix(safeName);
        Path dir = Paths.get(baseDir, subDir);
        Path target = dir.resolve(stored);
        registerRollbackCleanup(target);
        try {
            Files.createDirectories(dir);
            Files.write(target, bytes);
        } catch (IOException e) {
            throw new HrBusinessException("FILE_WRITE_FAILED", "写入文件失败：" + e.getMessage());
        }

        Map<String, Object> record = new LinkedHashMap<>();
        record.put("tenantId", tenantId);
        record.put("fileName", safeName);
        record.put("filePath", target.toString());
        // HR 本地文件均从授权业务入口读取，PRIVATE 记录不保存访问地址。
        record.put("url", "");
        record.put("fileSize", (long) bytes.length);
        record.put("fileHash", com.cloudflow.common.core.file.FilePreviewContent.digest(bytes));
        record.put("fileType", fileType);
        record.put("createBy", currentUserName());
        if (fileStorageMapper.insertSysFile(record) != 1) throw new HrBusinessException("FILE_WRITE_FAILED", "文件记录保存失败");
        Object fileId = record.get("fileId");
        if (fileId == null) {
            throw new HrBusinessException("FILE_KEY_MISSING", "sys_file 主键回填失败");
        }
        tenantQuotas.refreshStorage(tenantId);
        return ((Number) fileId).longValue();
    }

    private void registerRollbackCleanup(Path target) {
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCompletion(int status) {
                if (status == TransactionSynchronization.STATUS_COMMITTED) return;
                try { Files.deleteIfExists(target); }
                catch (IOException failure) { log.warn("未提交人事文件清理失败：{}", failure.getClass().getSimpleName()); }
            }
        });
    }

    /**
     * 按 file_id 读取本地文件内容；找不到时抛业务异常。
     */
    public byte[] load(Long fileId) {
        Map<String, Object> metadata = fileStorageMapper.selectFileMetadata(fileId, currentTenantId());
        if (metadata != null && java.util.Set.of("HR_GRIEVANCE", "HR_GRIEVANCE_EVIDENCE", "HR_LEAVE_PROOF", "HR_TAX_PROOF", "HR_ADVANCE_PROOF", "HR_REFERRAL_RESUME", "HR_EXIT_INTERVIEW", "HR_TRAINING_AGREEMENT", "HR_SEVERANCE_POLICY", "HR_SETTLEMENT_PROOF", "HR_ATTENDANCE_PHOTO")
                .contains(String.valueOf(metadata.get("fileType")))) {
            throw new HrBusinessException("FILE_ACCESS_DENIED", "私密附件须从对应业务入口读取");
        }
        return readFile(fileId);
    }

    public byte[] loadPrivate(Long fileId, String purpose) {
        fileName(fileId, purpose);
        return readFile(fileId);
    }

    private byte[] readFile(Long fileId) {
        if (fileId == null) {
            throw new HrBusinessException("INVALID_PARAMETER", "file_id 不能为空");
        }
        String path = fileStorageMapper.selectFilePathById(fileId, currentTenantId());
        if (!StringUtils.hasText(path)) {
            throw new HrBusinessException("FILE_NOT_FOUND", "文件不存在：" + fileId);
        }
        try {
            Path root = Paths.get(baseDir).toAbsolutePath().normalize().toRealPath();
            Path target = Paths.get(path).toAbsolutePath().normalize().toRealPath();
            if (!target.startsWith(root)) throw new HrBusinessException("FILE_ACCESS_DENIED", "文件不在允许的业务存储目录");
            return Files.readAllBytes(target);
        } catch (IOException e) {
            throw new HrBusinessException("FILE_READ_FAILED", "读取文件失败：" + e.getMessage());
        }
    }

    public String fileName(Long fileId, String fileType) {
        Map<String, Object> metadata = fileStorageMapper.selectFileMetadata(fileId, currentTenantId());
        if (metadata == null || !java.util.Objects.equals(fileType, metadata.get("fileType"))) {
            throw new HrBusinessException("FILE_ACCESS_DENIED", "文件不存在或用途不匹配");
        }
        return String.valueOf(metadata.get("fileName"));
    }

    private long currentTenantId() {
        Long tid = TenantContext.getTenantId();
        if (tid != null) {
            return tid;
        }
        tid = UserContext.getTenantId();
        return tid == null ? 100000L : tid;
    }

    private String currentUserName() {
        return StringUtils.hasText(UserContext.getUserName()) ? UserContext.getUserName() : "system";
    }

    private String suffix(String name) {
        int idx = name.lastIndexOf('.');
        return idx >= 0 ? name.substring(idx) : "";
    }
}
