package com.cloudflow.auth.storage;

import com.cloudflow.common.message.security.MessageSecretCipher;
import com.cloudflow.common.core.exception.ServiceException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class FileStorageSecretCipher {
    private final MessageSecretCipher delegate;

    public FileStorageSecretCipher(@Value("${cloudflow.file-storage.secret-key:${CLOUDFLOW_FILE_STORAGE_SECRET_KEY:}}") String key) {
        delegate = new MessageSecretCipher(key);
    }

    public String encrypt(String value) {
        try {
            return delegate.encrypt(value);
        } catch (RuntimeException exception) {
            throw new ServiceException("文件存储密钥加密失败，请检查独立加密密钥配置");
        }
    }

    public String decrypt(String value) {
        try {
            return delegate.decrypt(value);
        } catch (RuntimeException exception) {
            throw new ServiceException("文件存储密钥解密失败，请检查独立加密密钥配置");
        }
    }
}
