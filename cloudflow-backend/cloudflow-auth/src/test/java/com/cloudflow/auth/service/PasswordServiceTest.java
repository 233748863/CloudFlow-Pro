package com.cloudflow.auth.service;

import cn.hutool.crypto.SecureUtil;
import cn.hutool.crypto.digest.BCrypt;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class PasswordServiceTest {
    private final PasswordService service = new PasswordService();

    @Test
    void acceptsOnlyRawPasswordWithExistingTrimAndCaseRules() {
        String hash = service.encodePassword(" Abc123! ");
        assertTrue(service.matchesPassword("Abc123!", hash));
        assertTrue(service.matchesPassword(" Abc123! ", hash));
        assertFalse(service.matchesPassword("abc123!", hash));
        assertFalse(service.matchesPassword(SecureUtil.sha256("Abc123!"), hash));
        assertFalse(service.matchesPassword("Abc123!", BCrypt.hashpw("Abc123!", BCrypt.gensalt(4))));
        assertFalse(service.matchesPassword(" ", hash));
        assertFalse(service.matchesPassword(null, hash));
    }

    @Test
    void sixtyFourHexCharactersAreAnOrdinaryCaseSensitivePassword() {
        String password = "AB12".repeat(16);
        String hash = service.encodePassword(password);
        assertTrue(service.matchesPassword(password, hash));
        assertFalse(service.matchesPassword(password.toLowerCase(), hash));
        assertTrue(BCrypt.checkpw(SecureUtil.sha256(password), hash));
    }
}
