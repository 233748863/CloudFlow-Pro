package com.cloudflow.oa.service.impl;

import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

@Service
@RequiredArgsConstructor
public class OaQuotationFileService {
    private final OaPrivateFileStorageService files;
    public record UploadedFile(Long fileId, String fileName, String reference) { }

    public UploadedFile upload(MultipartFile upload) {
        OaPrivateFileStorageService.UploadedFile file = files.upload(OaPrivateFileStorageService.Kind.RFQ_QUOTATION, upload);
        return new UploadedFile(file.fileId(), file.fileName(), file.reference());
    }

    public void assertOwned(String reference, Long userId) { files.assertOwned(OaPrivateFileStorageService.Kind.RFQ_QUOTATION, reference, userId); }
    public ResponseEntity<byte[]> download(String reference) { return files.download(OaPrivateFileStorageService.Kind.RFQ_QUOTATION, reference); }
}
