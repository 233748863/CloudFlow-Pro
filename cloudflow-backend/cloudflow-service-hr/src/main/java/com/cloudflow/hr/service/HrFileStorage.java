package com.cloudflow.hr.service;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.hr.exception.HrBusinessException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.Objects;
import java.util.UUID;

/**
 * 把 PDF/电子件落地到 sys_file。本期采用本地磁盘路径作为存储载体，
 * 通过配置 {@code cloudflow.hr.storage.local-dir} 切换实际目录。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class HrFileStorage {

    private final JdbcTemplate jdbcTemplate;

    @Value("${cloudflow.hr.storage.local-dir:${user.home}/.cloudflow/hr/files}")
    private String baseDir;

    /**
     * 保存字节流并写 sys_file 行。
     *
     * @return sys_file.file_id
     */
    public Long save(byte[] bytes, String originalName, String fileType) {
        if (bytes == null || bytes.length == 0) {
            throw new HrBusinessException("INVALID_PARAMETER", "文件内容为空");
        }
        String safeName = StringUtils.hasText(originalName) ? originalName : "unnamed.bin";
        LocalDate today = LocalDate.now();
        String subDir = today.format(DateTimeFormatter.ofPattern("yyyy/MM"));
        String stored = UUID.randomUUID().toString().replace("-", "") + suffix(safeName);
        Path dir = Paths.get(baseDir, subDir);
        Path target = dir.resolve(stored);
        try {
            Files.createDirectories(dir);
            Files.write(target, bytes);
        } catch (IOException e) {
            throw new HrBusinessException("FILE_WRITE_FAILED", "写入文件失败：" + e.getMessage());
        }
        String relativePath = subDir + "/" + stored;
        String url = "/hr/ess/files/" + relativePath;

        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbcTemplate.update(con -> {
            PreparedStatement ps = con.prepareStatement(
                    "INSERT INTO sys_file (tenant_id, file_name, file_path, url, storage_type, "
                            + "file_size, file_type, create_by, create_time, deleted, remark) "
                            + "VALUES (?, ?, ?, ?, 'LOCAL', ?, ?, ?, NOW(), 0, 'hr-pdf')",
                    Statement.RETURN_GENERATED_KEYS);
            ps.setLong(1, currentTenantId());
            ps.setString(2, safeName);
            ps.setString(3, target.toString());
            ps.setString(4, url);
            ps.setLong(5, bytes.length);
            ps.setString(6, fileType);
            ps.setString(7, currentUserName());
            return ps;
        }, keyHolder);
        return Objects.requireNonNull(keyHolder.getKey(), "sys_file 主键回填失败").longValue();
    }

    /**
     * 按 file_id 读取本地文件内容；找不到时抛业务异常。
     */
    public byte[] load(Long fileId) {
        if (fileId == null) {
            throw new HrBusinessException("INVALID_PARAMETER", "file_id 不能为空");
        }
        String path = jdbcTemplate.query(
                "SELECT file_path FROM sys_file WHERE file_id = ? AND deleted = 0 LIMIT 1",
                rs -> rs.next() ? rs.getString(1) : null,
                fileId);
        if (!StringUtils.hasText(path)) {
            throw new HrBusinessException("FILE_NOT_FOUND", "文件不存在：" + fileId);
        }
        try {
            return Files.readAllBytes(Paths.get(path));
        } catch (IOException e) {
            throw new HrBusinessException("FILE_READ_FAILED", "读取文件失败：" + e.getMessage());
        }
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
