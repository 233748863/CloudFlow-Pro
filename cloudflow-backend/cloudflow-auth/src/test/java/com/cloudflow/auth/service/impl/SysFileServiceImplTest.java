package com.cloudflow.auth.service.impl;

import com.cloudflow.auth.domain.SysFile;
import com.cloudflow.auth.enums.FileStorageType;
import com.cloudflow.auth.mapper.SysFileMapper;
import com.cloudflow.auth.service.SysTenantService;
import com.cloudflow.auth.storage.FileStorageRegistry;
import com.cloudflow.auth.config.properties.FileStorageProperties;
import com.cloudflow.auth.storage.FileStorageService;
import com.cloudflow.auth.storage.model.StoredFileInfo;
import org.junit.jupiter.api.Test;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.lang.reflect.Proxy;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

class SysFileServiceImplTest {

    @Test
    void uploadFileShouldPersistStorageTypeAndRefreshTenantUsage() {
        AtomicReference<String> insertedStorageTypeRef = new AtomicReference<>();
        AtomicReference<String> insertedFilePathRef = new AtomicReference<>();
        AtomicReference<String> insertedPersistedUrlRef = new AtomicReference<>();

        FileStorageService storageService = proxy(FileStorageService.class, (methodName, args) -> {
            if ("getStorageType".equals(methodName)) {
                return FileStorageType.OSS;
            }
            if ("store".equals(methodName)) {
                return StoredFileInfo.builder()
                    .filePath("upload/2026/03/11/demo.pdf")
                    .persistedUrl("https://oss.example.com/bucket/upload/2026/03/11/demo.pdf")
                    .build();
            }
            if ("resolveUrl".equals(methodName)) {
                return "https://signed.example.com/demo.pdf?token=abc";
            }
            return null;
        });

        FileStorageProperties fileStorageProperties = new FileStorageProperties();
        fileStorageProperties.setType("OSS");
        FileStorageRegistry storageRegistry = new FileStorageRegistry(java.util.List.of(storageService), fileStorageProperties);

        SysFileServiceImpl service = new SysFileServiceImpl(
            proxy(SysFileMapper.class, (methodName, args) -> {
                if ("insert".equals(methodName)) {
                    SysFile sysFile = (SysFile) args[0];
                    sysFile.setFileId(100001L);
                    insertedStorageTypeRef.set(sysFile.getStorageType());
                    insertedFilePathRef.set(sysFile.getFilePath());
                    insertedPersistedUrlRef.set(sysFile.getUrl());
                    return 1;
                }
                return null;
            }),
            proxy(SysTenantService.class, (methodName, args) -> {
                if ("hasAvailableStorage".equals(methodName)) {
                    return true;
                }
                if ("refreshTenantStorageSummary".equals(methodName)) {
                    return null;
                }
                return null;
            }),
            storageRegistry
        );

        MultipartFile file = new SimpleMultipartFile("demo.pdf", "application/pdf", new byte[]{1, 2, 3});

        Long previousTenantId = com.cloudflow.common.core.context.UserContext.getTenantId();
        String previousUserName = com.cloudflow.common.core.context.UserContext.getUserName();
        try {
            com.cloudflow.common.core.context.UserContext.setTenantId(200001L);
            com.cloudflow.common.core.context.UserContext.setUserName("tester");

            SysFile result = service.uploadFile(file);

            assertNotNull(insertedStorageTypeRef.get());
            assertEquals("OSS", insertedStorageTypeRef.get());
            assertEquals("upload/2026/03/11/demo.pdf", insertedFilePathRef.get());
            assertEquals("https://oss.example.com/bucket/upload/2026/03/11/demo.pdf", insertedPersistedUrlRef.get());
            assertEquals("https://signed.example.com/demo.pdf?token=abc", result.getUrl());
        } finally {
            com.cloudflow.common.core.context.UserContext.setTenantId(previousTenantId);
            com.cloudflow.common.core.context.UserContext.setUserName(previousUserName);
        }
    }

    @Test
    void deleteFileByIdsShouldDeleteStoredContentBeforeSoftDelete() {
        AtomicReference<String> deletedPathRef = new AtomicReference<>();
        AtomicReference<SysFile> updatedFileRef = new AtomicReference<>();

        FileStorageService storageService = proxy(FileStorageService.class, (methodName, args) -> {
            if ("delete".equals(methodName)) {
                deletedPathRef.set((String) args[0]);
            }
            if ("getStorageType".equals(methodName)) {
                return FileStorageType.OSS;
            }
            return null;
        });

        FileStorageProperties fileStorageProperties = new FileStorageProperties();
        fileStorageProperties.setType("OSS");
        FileStorageRegistry storageRegistry = new FileStorageRegistry(java.util.List.of(storageService), fileStorageProperties);

        SysFileServiceImpl service = new SysFileServiceImpl(
            proxy(SysFileMapper.class, (methodName, args) -> {
                if ("selectById".equals(methodName)) {
                    SysFile sysFile = new SysFile();
                    sysFile.setFileId(100002L);
                    sysFile.setTenantId(200002L);
                    sysFile.setDelFlag("0");
                    sysFile.setStorageType("OSS");
                    sysFile.setFilePath("upload/2026/03/11/demo.pdf");
                    return sysFile;
                }
                if ("updateById".equals(methodName)) {
                    updatedFileRef.set((SysFile) args[0]);
                    return 1;
                }
                return null;
            }),
            proxy(SysTenantService.class, (methodName, args) -> null),
            storageRegistry
        );

        service.deleteFileByIds(new Long[]{100002L});

        assertEquals("upload/2026/03/11/demo.pdf", deletedPathRef.get());
        assertNotNull(updatedFileRef.get());
        assertEquals("2", updatedFileRef.get().getDelFlag());
    }

    @SuppressWarnings("unchecked")
    private static <T> T proxy(Class<T> type, Handler handler) {
        return (T) Proxy.newProxyInstance(
            type.getClassLoader(),
            new Class<?>[]{type},
            (proxy, method, args) -> {
                if ("toString".equals(method.getName())) {
                    return type.getSimpleName() + "Proxy";
                }
                if ("hashCode".equals(method.getName())) {
                    return System.identityHashCode(proxy);
                }
                if ("equals".equals(method.getName())) {
                    return proxy == args[0];
                }
                return handler.invoke(method.getName(), args);
            }
        );
    }

    @FunctionalInterface
    private interface Handler {
        Object invoke(String methodName, Object[] args);
    }

    /**
     * 简易 MultipartFile 测试桩，避免引入额外的 spring-test 依赖。
     */
    private static class SimpleMultipartFile implements MultipartFile {

        private final String originalFilename;
        private final String contentType;
        private final byte[] bytes;

        private SimpleMultipartFile(String originalFilename, String contentType, byte[] bytes) {
            this.originalFilename = originalFilename;
            this.contentType = contentType;
            this.bytes = bytes;
        }

        @Override
        public String getName() {
            return "file";
        }

        @Override
        public String getOriginalFilename() {
            return originalFilename;
        }

        @Override
        public String getContentType() {
            return contentType;
        }

        @Override
        public boolean isEmpty() {
            return bytes.length == 0;
        }

        @Override
        public long getSize() {
            return bytes.length;
        }

        @Override
        public byte[] getBytes() {
            return bytes;
        }

        @Override
        public InputStream getInputStream() {
            return new ByteArrayInputStream(bytes);
        }

        @Override
        public void transferTo(java.io.File dest) throws IOException {
            throw new UnsupportedOperationException("测试桩未实现 transferTo");
        }
    }
}
