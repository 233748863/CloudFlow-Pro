package com.cloudflow.common.encrypt.core;

import com.cloudflow.common.encrypt.enums.AlgorithmType;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class EncryptUtilsTest {

    @Test
    void encryptShouldThrowWhenKeyInvalid() {
        assertThrows(EncryptUtils.EncryptException.class,
                () -> EncryptUtils.encrypt("secret", AlgorithmType.AES, ""));
    }

    @Test
    void decryptShouldMaskWhenCipherInvalid() {
        assertEquals("***", EncryptUtils.decrypt("not-a-valid-cipher", AlgorithmType.AES, "1234567890123456"));
    }

    @Test
    void encryptAndDecryptShouldBeSymmetric() {
        String cipher = EncryptUtils.encrypt("secret", AlgorithmType.AES, "1234567890123456");
        assertEquals("secret", EncryptUtils.decrypt(cipher, AlgorithmType.AES, "1234567890123456"));
    }
}
