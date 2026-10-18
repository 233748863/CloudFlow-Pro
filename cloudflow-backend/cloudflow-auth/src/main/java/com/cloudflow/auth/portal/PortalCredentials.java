package com.cloudflow.auth.portal;

import cn.hutool.crypto.digest.BCrypt;
import com.cloudflow.common.core.exception.ServiceException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Set;
import org.springframework.stereotype.Component;

@Component
public class PortalCredentials {
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Set<String> WEAK_STEMS = Set.of("password", "passw0rd", "p@ssword", "p@ssw0rd",
            "qwerty", "qazwsx", "letmein", "welcome", "changeme", "administrator", "iloveyou", "cloudflow");
    private final String dummyHash = BCrypt.hashpw(randomToken(), BCrypt.gensalt(12));

    public String account(String value) {
        String normalized = value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
        if (!normalized.matches("[a-z0-9][a-z0-9._@+-]{2,99}")) {
            throw new ServiceException("登录账号须为3—100位字母、数字或邮箱格式字符", 400);
        }
        return normalized;
    }

    public void validate(String password, String account, String email) {
        if (!validLength(password)) throw new ServiceException("密码须为12—64字符，UTF-8编码不超过72字节", 400);
        boolean uppercase = false;
        boolean lowercase = false;
        boolean digit = false;
        boolean symbol = false;
        for (int offset = 0; offset < password.length();) {
            int character = password.codePointAt(offset);
            if (Character.isISOControl(character) || Character.isWhitespace(character)
                    || Character.getType(character) == Character.FORMAT
                    || Character.getType(character) == Character.SURROGATE) {
                throw new ServiceException("密码不能包含空白、控制字符或无效字符", 400);
            }
            uppercase |= Character.isUpperCase(character);
            lowercase |= Character.isLowerCase(character);
            digit |= Character.isDigit(character);
            symbol |= !Character.isLetterOrDigit(character);
            offset += Character.charCount(character);
        }
        if (!uppercase || !lowercase || !digit || !symbol) {
            throw new ServiceException("密码须同时包含大写字母、小写字母、数字和符号", 400);
        }
        String lowered = password.toLowerCase(Locale.ROOT);
        String accountPart = account == null ? "" : account.toLowerCase(Locale.ROOT).split("@", 2)[0];
        String emailPart = email == null ? "" : email.toLowerCase(Locale.ROOT).split("@", 2)[0];
        if (WEAK_STEMS.stream().anyMatch(lowered::contains)
                || accountPart.length() >= 3 && lowered.contains(accountPart)
                || emailPart.length() >= 3 && lowered.contains(emailPart)) {
            throw new ServiceException("密码包含常见弱口令或账号信息，请更换", 400);
        }
    }

    public String encode(String password, String account, String email) {
        validate(password, account, email);
        return BCrypt.hashpw(password, BCrypt.gensalt(12));
    }

    public boolean matches(String password, String storedHash) {
        boolean usable = validLength(password) && storedHash != null
                && storedHash.matches("\\$2[aby]\\$12\\$[./A-Za-z0-9]{53}");
        boolean matched = BCrypt.checkpw(validLength(password) ? password : "Invalid-P0rtal-Credential!",
                usable ? storedHash : dummyHash);
        return usable && matched;
    }

    public static boolean validLength(String password) {
        if (password == null || password.length() > 128) return false;
        int characters = password.codePointCount(0, password.length());
        return characters >= 12 && characters <= 64 && password.getBytes(StandardCharsets.UTF_8).length <= 72;
    }

    public static String randomToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    public static String activationHash(String token) {
        return token != null && token.matches("[A-Za-z0-9_-]{43}") ? digest(token) : null;
    }

    public static String digest(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException("SHA-256不可用", impossible);
        }
    }
}
