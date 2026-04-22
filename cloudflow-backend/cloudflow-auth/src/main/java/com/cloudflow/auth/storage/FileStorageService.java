package com.cloudflow.auth.storage;

import com.cloudflow.auth.enums.FileStorageType;
import com.cloudflow.auth.storage.model.StoredFileInfo;
import org.springframework.web.multipart.MultipartFile;

/**
 * 文件存储服务接口。
 * <p>
 * 职责：
 * 1. 抽象文件上传存储能力。
 * 2. 提供删除与访问地址解析能力。
 * 3. 屏蔽本地存储与 OSS 实现差异。
 */
public interface FileStorageService {

    /**
     * 返回当前存储实现类型。
     */
    FileStorageType getStorageType();

    /**
     * 存储上传文件。
     */
    StoredFileInfo store(MultipartFile file) throws Exception;

    /**
     * 删除已存储文件。
     */
    void delete(String filePath);

    /**
     * 解析文件可访问 URL。
     */
    String resolveUrl(String filePath);
}
