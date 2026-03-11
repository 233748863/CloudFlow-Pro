package com.cloudflow.auth.storage.impl;

import cn.hutool.core.io.FileUtil;
import cn.hutool.core.util.StrUtil;
import com.cloudflow.auth.enums.FileStorageType;
import com.cloudflow.auth.storage.FileStorageService;
import com.cloudflow.auth.storage.model.StoredFileInfo;
import com.cloudflow.common.config.CloudFlowConfig;
import com.cloudflow.common.core.utils.file.FileUploadUtils;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;

/**
 * ?????????
 * <p>
 * ?????????????cloudflow.profile/upload?
 */
@Service
public class LocalFileStorageService implements FileStorageService {

    @Override
    public FileStorageType getStorageType() {
        return FileStorageType.LOCAL;
    }

    @Override
    public StoredFileInfo store(MultipartFile file) throws Exception {
        String relativePath = FileUploadUtils.upload(CloudFlowConfig.getUploadPath(), file);
        return StoredFileInfo.builder()
            .filePath(relativePath)
            .persistedUrl(relativePath)
            .build();
    }

    @Override
    public void delete(String filePath) {
        if (StrUtil.isBlank(filePath)) {
            return;
        }
        String relativePath = StrUtil.removePrefix(filePath, "/");
        File targetFile = FileUtil.file(CloudFlowConfig.getProfile(), relativePath);
        if (targetFile.exists()) {
            FileUtil.del(targetFile);
        }
    }

    @Override
    public String resolveUrl(String filePath) {
        return StrUtil.blankToDefault(filePath, "");
    }
}
