package com.cloudflow.hr.service;

import com.cloudflow.common.encrypt.properties.EncryptorProperties;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;

import static com.cloudflow.hr.service.HrHException.conflict;

@Service
@RequiredArgsConstructor
public class HrHCipherService {
    private static final SecureRandom RANDOM = new SecureRandom();
    private final ObjectProvider<EncryptorProperties> properties;

    private SecretKeySpec key() {
        EncryptorProperties configuration = properties.getIfAvailable();
        if (configuration == null || !configuration.isEnabled() || configuration.getAesKey() == null) {
            throw conflict("PAY_ENCRYPTION_UNAVAILABLE", "薪资加密未启用，不能读取或保存核价金额");
        }
        byte[] bytes = configuration.getAesKey().getBytes(StandardCharsets.UTF_8);
        if (bytes.length != 16 && bytes.length != 24 && bytes.length != 32) {
            throw conflict("PAY_ENCRYPTION_UNAVAILABLE", "薪资加密密钥配置无效");
        }
        return new SecretKeySpec(bytes, "AES");
    }

    public String seal(String plain) {
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            byte[] nonce = new byte[12]; RANDOM.nextBytes(nonce);
            cipher.init(Cipher.ENCRYPT_MODE, key(), new GCMParameterSpec(128, nonce));
            byte[] encrypted = cipher.doFinal(plain.getBytes(StandardCharsets.UTF_8));
            byte[] payload = Arrays.copyOf(nonce, nonce.length + encrypted.length);
            System.arraycopy(encrypted, 0, payload, nonce.length, encrypted.length);
            return "H1:" + Base64.getEncoder().encodeToString(payload);
        } catch (HrHException failure) { throw failure; }
        catch (Exception failure) { throw conflict("PAY_ENCRYPTION_UNAVAILABLE", "薪资加密失败，未保存金额"); }
    }

    public String open(String encrypted) {
        try {
            if (encrypted == null || !encrypted.startsWith("H1:")) throw new IllegalArgumentException();
            byte[] payload = Base64.getDecoder().decode(encrypted.substring(3));
            if (payload.length < 29) throw new IllegalArgumentException();
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, payload, 0, 12));
            return new String(cipher.doFinal(payload, 12, payload.length - 12), StandardCharsets.UTF_8);
        } catch (HrHException failure) { throw failure; }
        catch (Exception failure) { throw conflict("PAY_CIPHER_INVALID", "薪资加密依据无法验证"); }
    }

    public String legacyAmount(String plain) {
        try {
            Cipher cipher = Cipher.getInstance("AES/ECB/PKCS5Padding");
            cipher.init(Cipher.ENCRYPT_MODE, key());
            return Base64.getEncoder().encodeToString(cipher.doFinal(plain.getBytes(StandardCharsets.UTF_8)));
        } catch (HrHException failure) { throw failure; }
        catch (Exception failure) { throw conflict("PAY_ENCRYPTION_UNAVAILABLE", "工资变动加密失败，未生成变动"); }
    }
}
