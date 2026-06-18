package com.cloudflow.auth.config.properties;

import com.cloudflow.common.core.utils.file.FileUploadUtils;
import com.cloudflow.common.core.utils.file.MimeTypeUtils;
import com.cloudflow.common.redis.config.RuntimeSysConfigService;
import com.cloudflow.common.redis.config.SysConfigKeys;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.List;

/**
 * 文件上传安全配置。
 */
@Component
public class FileUploadProperties {

    @Autowired(required = false)
    private RuntimeSysConfigService runtimeSysConfigService;

    public long getResolvedMaxSize() {
        if (runtimeSysConfigService == null) {
            return FileUploadUtils.DEFAULT_MAX_SIZE;
        }
        return runtimeSysConfigService.getLong(SysConfigKeys.AUTH_FILE_UPLOAD_MAX_SIZE, FileUploadUtils.DEFAULT_MAX_SIZE);
    }

    public String[] getAllowedExtensionArray() {
        List<String> defaultExtensions = Arrays.asList(MimeTypeUtils.DEFAULT_ALLOWED_EXTENSION);
        if (runtimeSysConfigService == null) {
            return defaultExtensions.toArray(new String[0]);
        }
        return runtimeSysConfigService.getCsv(
                SysConfigKeys.AUTH_FILE_UPLOAD_ALLOWED_EXTENSIONS,
                defaultExtensions
        ).toArray(new String[0]);
    }
}
