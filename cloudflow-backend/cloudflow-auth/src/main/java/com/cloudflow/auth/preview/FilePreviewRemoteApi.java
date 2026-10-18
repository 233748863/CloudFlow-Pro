package com.cloudflow.auth.preview;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.file.FilePreviewBinding;
import com.cloudflow.common.core.file.FilePreviewRequest;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

public interface FilePreviewRemoteApi {
    @PostMapping("/authorize")
    R<FilePreviewBinding> authorize(@RequestBody FilePreviewRequest request);

    @PostMapping("/download-authorize")
    R<FilePreviewBinding> authorizeDownload(@RequestBody FilePreviewRequest request);
}
