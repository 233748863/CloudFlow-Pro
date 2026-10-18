package com.cloudflow.auth.download;

import com.cloudflow.auth.preview.FilePreviewResolver;
import com.cloudflow.common.core.file.FilePreviewRequest;
import java.util.Set;

/** 业务注册的文件访问校验器；未注册的业务类型拒绝访问。 */
public interface FileAccessChecker {
    Set<String> businessTypes();
    FilePreviewResolver.Resolved authorize(FilePreviewRequest request);
}
