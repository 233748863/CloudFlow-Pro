package com.cloudflow.hr.controller;

import com.cloudflow.common.core.domain.R;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.UUID;

/**
 * 文件上传Controller
 *
 * @author CloudFlow
 * @since 2026-03-20
 */
@Slf4j
@RestController
@RequestMapping("/file")
@RequiredArgsConstructor
@Tag(name = "文件上传", description = "文件上传相关接口")
public class FileUploadController {

    @Value("${file.upload.path:./uploads}")
    private String uploadPath;

    @Value("${file.upload.base-url:http://localhost:9103}")
    private String baseUrl;

    /**
     * 上传简历文件
     */
    @PostMapping("/upload/resume")
    @Operation(summary = "上传简历文件", description = "上传候选人简历文件（支持PDF、DOC、DOCX格式）")
    public R<String> uploadResume(
            @Parameter(description = "简历文件") @RequestParam("file") MultipartFile file) {
        log.info("上传简历文件，文件名：{}，文件大小：{} bytes", file.getOriginalFilename(), file.getSize());

        // 1. 验证文件是否为空
        if (file.isEmpty()) {
            return R.fail("文件不能为空");
        }

        // 2. 验证文件大小（限制10MB）
        long maxSize = 10 * 1024 * 1024; // 10MB
        if (file.getSize() > maxSize) {
            return R.fail("文件大小不能超过10MB");
        }

        // 3. 验证文件类型
        String originalFilename = file.getOriginalFilename();
        if (originalFilename == null) {
            return R.fail("文件名不能为空");
        }

        String extension = getFileExtension(originalFilename);
        if (!isValidResumeExtension(extension)) {
            return R.fail("只支持PDF、DOC、DOCX格式的文件");
        }

        try {
            // 4. 生成文件存储路径（按日期分目录）
            String datePath = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyy/MM/dd"));
            String relativePath = "resume/" + datePath;
            Path directoryPath = resolveUploadDirectory(relativePath);

            // 5. 创建目录（如果不存在）
            if (!Files.exists(directoryPath)) {
                Files.createDirectories(directoryPath);
            }

            // 6. 生成唯一文件名
            String uuid = UUID.randomUUID().toString().replace("-", "");
            String newFilename = uuid + "." + extension;
            Path filePath = directoryPath.resolve(newFilename);

            // 7. 保存文件
            file.transferTo(filePath.toFile());

            // 8. 生成文件访问URL
            String fileUrl = baseUrl + "/uploads/" + relativePath + "/" + newFilename;

            log.info("简历文件上传成功，文件URL：{}", fileUrl);
            return R.ok(fileUrl);

        } catch (IOException e) {
            log.error("简历文件上传失败", e);
            return R.fail("文件上传失败：" + e.getMessage());
        }
    }

    /**
     * 解析上传根目录。
     * 兼容 Linux 下的绝对路径配置，以及 Windows 下以 `/data/...` 形式写入但被误判为相对路径的场景。
     */
    private Path resolveUploadDirectory(String relativePath) {
        Path basePath = Paths.get(uploadPath);
        if (!basePath.isAbsolute()) {
            String normalized = uploadPath;
            if (normalized.startsWith("/") || normalized.startsWith("\\")) {
                Path currentRoot = Paths.get(System.getProperty("user.dir")).toAbsolutePath().getRoot();
                if (currentRoot != null) {
                    normalized = currentRoot.resolve(normalized.replaceFirst("^[\\\\/]+", "")).toString();
                }
            } else {
                normalized = basePath.toAbsolutePath().toString();
            }
            basePath = Paths.get(normalized);
        }
        return basePath.resolve(relativePath).normalize();
    }

    /**
     * 获取文件扩展名
     */
    private String getFileExtension(String filename) {
        int lastDotIndex = filename.lastIndexOf('.');
        if (lastDotIndex > 0 && lastDotIndex < filename.length() - 1) {
            return filename.substring(lastDotIndex + 1).toLowerCase();
        }
        return "";
    }

    /**
     * 验证简历文件扩展名是否有效
     */
    private boolean isValidResumeExtension(String extension) {
        return "pdf".equals(extension) || "doc".equals(extension) || "docx".equals(extension);
    }
}
