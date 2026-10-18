package com.cloudflow.hr.service;

import java.net.IDN;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class HrRecruitmentContacts {
    private static final Pattern TEXT_PHONE = Pattern.compile("(?<![\\p{L}\\p{N}+])\\+[0-9][0-9 ()-]*(?![\\p{L}\\p{N}+])");
    private static final Pattern TEXT_EMAIL = Pattern.compile("[^\\s<>\"(),;:：]+@[^\\s<>\"(),;:：]+");

    private HrRecruitmentContacts() { }

    public record Identity(String type, String hash) { }
    public record Contacts(String phone, String email, List<Identity> identities) { }

    public static Contacts normalize(Long tenantId, String phone, String email, boolean required) {
        if (tenantId == null || tenantId <= 0) throw new IllegalArgumentException("招聘联系方式缺少租户");
        String normalizedPhone = phone(phone);
        String normalizedEmail = email(email);
        if (required && normalizedPhone == null && normalizedEmail == null) throw new IllegalArgumentException("手机或邮箱至少填写一项");
        List<Identity> identities = new ArrayList<>();
        if (normalizedPhone != null) identities.add(new Identity("PHONE", digest(tenantId, "PHONE", normalizedPhone)));
        if (normalizedEmail != null) identities.add(new Identity("EMAIL", digest(tenantId, "EMAIL", normalizedEmail)));
        identities.sort(Comparator.comparing(Identity::type).thenComparing(Identity::hash));
        return new Contacts(normalizedPhone, normalizedEmail, List.copyOf(identities));
    }

    public static String phone(String input) {
        if (input == null || input.isBlank()) return null;
        String phone = input.strip();
        if (phone.length() > 32 || !phone.matches("\\+[1-9][0-9 ()-]{5,30}")) throw new IllegalArgumentException("手机号须显式填写+国家区号");
        phone = phone.replace(" ", "").replace("(", "").replace(")", "").replace("-", "");
        if (!phone.matches("\\+[1-9][0-9]{6,14}")) throw new IllegalArgumentException("手机号须为+国家区号及7至15位数字");
        return phone;
    }

    public static String email(String input) {
        if (input == null || input.isBlank()) return null;
        String email = input.strip();
        int separator = email.indexOf('@');
        if (separator < 1 || separator != email.lastIndexOf('@') || separator > 64 || email.length() > 254) throw new IllegalArgumentException("邮箱格式无效");
        String local = email.substring(0, separator).toLowerCase(Locale.ROOT);
        String domain;
        try { domain = IDN.toASCII(email.substring(separator + 1), IDN.USE_STD3_ASCII_RULES).toLowerCase(Locale.ROOT); }
        catch (IllegalArgumentException failure) { throw new IllegalArgumentException("邮箱域名无效"); }
        if (!local.matches("[a-z0-9!#$%&'*+/=?^_`{|}~.-]+") || local.startsWith(".") || local.endsWith(".") || local.contains("..")
                || domain.length() > 253 || !domain.contains(".") || domain.endsWith(".")) throw new IllegalArgumentException("邮箱格式无效");
        for (String label : domain.split("\\.", -1)) {
            if (!label.matches("[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?")) throw new IllegalArgumentException("邮箱域名无效");
        }
        String normalized = local + "@" + domain;
        if (normalized.length() > 254) throw new IllegalArgumentException("邮箱长度超过254字符");
        return normalized;
    }

    public static String phoneFromText(String text) {
        Matcher matches = TEXT_PHONE.matcher(text == null ? "" : text);
        while (matches.find()) {
            try { return phone(matches.group()); }
            catch (IllegalArgumentException invalidContact) { }
        }
        return null;
    }

    public static String emailFromText(String text) {
        Matcher matches = TEXT_EMAIL.matcher(text == null ? "" : text);
        while (matches.find()) {
            try { return email(matches.group()); }
            catch (IllegalArgumentException invalidContact) { }
        }
        return null;
    }

    private static String digest(Long tenantId, String type, String value) {
        try {
            byte[] bytes = (tenantId + ":" + type + ":" + value).getBytes(StandardCharsets.UTF_8);
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (NoSuchAlgorithmException failure) {
            throw new IllegalStateException("SHA-256不可用", failure);
        }
    }
}
