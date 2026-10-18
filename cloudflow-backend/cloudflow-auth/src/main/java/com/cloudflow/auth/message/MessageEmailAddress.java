package com.cloudflow.auth.message;

import jakarta.mail.internet.InternetAddress;
import java.net.IDN;
import java.util.Locale;

public final class MessageEmailAddress {
    private MessageEmailAddress() { }

    public static String normalize(String input) {
        if (input == null || input.length() > 254 || input.chars().anyMatch(value -> value < 32 || value == 127)) {
            throw new IllegalArgumentException("邮件地址格式无效");
        }
        String value = input.trim();
        int separator = value.lastIndexOf('@');
        if (separator < 1 || separator == value.length() - 1) throw new IllegalArgumentException("邮件地址格式无效");
        String domain = IDN.toASCII(value.substring(separator + 1), IDN.USE_STD3_ASCII_RULES).toLowerCase(Locale.ROOT);
        String normalized = value.substring(0, separator) + "@" + domain;
        try {
            InternetAddress[] addresses = InternetAddress.parse(normalized, true);
            if (addresses.length != 1 || addresses[0].isGroup() || addresses[0].getPersonal() != null
                    || !normalized.equals(addresses[0].getAddress()) || normalized.length() > 254
                    || domain.endsWith(".") || domain.startsWith(".") || domain.contains("..")) {
                throw new IllegalArgumentException("邮件地址格式无效");
            }
            addresses[0].validate();
            return normalized;
        } catch (Exception failure) {
            throw new IllegalArgumentException("邮件地址格式无效");
        }
    }
}
