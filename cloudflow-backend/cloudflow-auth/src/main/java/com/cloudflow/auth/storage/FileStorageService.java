package com.cloudflow.auth.storage;

import com.cloudflow.auth.enums.FileStorageType;
import com.cloudflow.auth.domain.SysFileConfig;
import com.cloudflow.auth.storage.model.StoredFileInfo;
import com.cloudflow.common.core.utils.file.FileUploadUtils;
import java.io.IOException;
import java.io.InputStream;

/**
 * 文件存储服务接口。
 * <p>
 * 职责：
 * 1. 抽象文件上传存储能力。
 * 2. 提供删除与访问地址解析能力。
 * 3. 屏蔽本地存储与 OSS 实现差异。
 */
public interface FileStorageService {

    default SysFileConfig getConfiguration() {
        return null;
    }

    default String getBucket() {
        return null;
    }

    default void validate(FileUploadUtils.ValidatedFile file) {
    }

    /**
     * 返回当前存储实现类型。
     */
    FileStorageType getStorageType();

    /**
     * 存储上传文件。
     */
    StoredFileInfo store(FileUploadUtils.ValidatedFile file) throws Exception;

    /**
     * 删除已存储文件。
     */
    void delete(String filePath);

    /**
     * 解析文件可访问 URL。
     */
    String resolveUrl(String filePath);

    /** 按明确秒数生成对象存储签名，不能降级为公开地址。 */
    default String resolveSignedUrl(String filePath, int seconds) {
        throw new IllegalStateException("当前存储不支持签名地址");
    }

    InputStream open(String filePath) throws IOException;
}
