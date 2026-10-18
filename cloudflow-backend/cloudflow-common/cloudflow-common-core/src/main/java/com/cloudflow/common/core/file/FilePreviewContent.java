package com.cloudflow.common.core.file;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Map;

public final class FilePreviewContent {
    public static final int MAX_BYTES = 20 * 1024 * 1024;
    private static final Map<String, String> TYPES = Map.of("pdf", "application/pdf", "png", "image/png",
            "jpg", "image/jpeg", "jpeg", "image/jpeg", "gif", "image/gif", "webp", "image/webp");

    private FilePreviewContent() { }

    public static String mediaType(String fileName) {
        if (fileName == null || fileName.length() > 255 || fileName.chars().anyMatch(character -> character < 32 || character == 127)) return null;
        int separator = fileName.lastIndexOf('.');
        return separator < 0 ? null : TYPES.get(fileName.substring(separator + 1).toLowerCase(Locale.ROOT));
    }

    public static boolean matches(byte[] bytes, String mediaType) {
        if (bytes == null || bytes.length == 0 || bytes.length > MAX_BYTES || mediaType == null) return false;
        return switch (mediaType) {
            case "application/pdf" -> bytes.length >= 8 && ascii(bytes, 0, 5).equals("%PDF-")
                    && (ascii(bytes, 5, 3).matches("1\\.[0-7]") || ascii(bytes, 5, 3).equals("2.0"));
            case "image/png" -> bytes.length >= 24 && (bytes[0] & 255) == 137 && ascii(bytes, 1, 3).equals("PNG")
                    && bytes[4] == 13 && bytes[5] == 10 && bytes[6] == 26 && bytes[7] == 10 && ascii(bytes, 12, 4).equals("IHDR");
            case "image/jpeg" -> bytes.length >= 4 && (bytes[0] & 255) == 255 && (bytes[1] & 255) == 216 && (bytes[2] & 255) == 255;
            case "image/gif" -> bytes.length >= 13 && (ascii(bytes, 0, 6).equals("GIF87a") || ascii(bytes, 0, 6).equals("GIF89a"));
            case "image/webp" -> bytes.length >= 16 && ascii(bytes, 0, 4).equals("RIFF") && ascii(bytes, 8, 4).equals("WEBP")
                    && (ascii(bytes, 12, 4).equals("VP8 ") || ascii(bytes, 12, 4).equals("VP8L") || ascii(bytes, 12, 4).equals("VP8X"));
            default -> false;
        };
    }

    public static String digest(byte[] value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value)); }
        catch (NoSuchAlgorithmException failure) { throw new IllegalStateException("附件摘要算法不可用"); }
    }

    public static String digest(String value) { return digest(value.getBytes(StandardCharsets.UTF_8)); }

    private static String ascii(byte[] bytes, int offset, int count) {
        return new String(bytes, offset, count, StandardCharsets.US_ASCII);
    }
}
