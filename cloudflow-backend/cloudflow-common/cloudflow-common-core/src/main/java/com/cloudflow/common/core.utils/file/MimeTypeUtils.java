package com.cloudflow.common.core.utils.file;

import cn.hutool.core.util.StrUtil;

import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

public class MimeTypeUtils {
    public static final String IMAGE_PNG = "image/png";
    public static final String IMAGE_JPG = "image/jpg";
    public static final String IMAGE_JPEG = "image/jpeg";
    public static final String IMAGE_BMP = "image/bmp";
    public static final String IMAGE_GIF = "image/gif";
    public static final String APPLICATION_PDF = "application/pdf";
    public static final String APPLICATION_ZIP = "application/zip";
    public static final String APPLICATION_ZIP_COMPRESSED = "application/x-zip-compressed";
    public static final String APPLICATION_RAR = "application/vnd.rar";
    public static final String APPLICATION_RAR_COMPRESSED = "application/x-rar-compressed";
    public static final String APPLICATION_GZIP = "application/gzip";
    public static final String APPLICATION_GZIP_COMPRESSED = "application/x-gzip";
    public static final String APPLICATION_BZIP2 = "application/x-bzip2";
    public static final String APPLICATION_MSWORD = "application/msword";
    public static final String APPLICATION_MSEXCEL = "application/vnd.ms-excel";
    public static final String APPLICATION_MSPOWERPOINT = "application/vnd.ms-powerpoint";
    public static final String APPLICATION_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    public static final String APPLICATION_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    public static final String APPLICATION_PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    public static final String APPLICATION_COMPOUND_FILE = "application/x-cfb";
    public static final String APPLICATION_OCTET_STREAM = "application/octet-stream";
    public static final String APPLICATION_REALMEDIA = "application/vnd.rn-realmedia";
    public static final String APPLICATION_REALMEDIA_VBR = "application/vnd.rn-realmedia-vbr";
    public static final String APPLICATION_FLASH = "application/x-shockwave-flash";
    public static final String TEXT_PLAIN = "text/plain";
    public static final String TEXT_HTML = "text/html";
    public static final String VIDEO_MP4 = "video/mp4";
    public static final String VIDEO_AVI = "video/x-msvideo";
    public static final String VIDEO_FLV = "video/x-flv";
    public static final String VIDEO_WMV = "video/x-ms-wmv";
    public static final String VIDEO_ASF = "video/x-ms-asf";
    public static final String AUDIO_WAV = "audio/wav";
    public static final String AUDIO_WAV_ALT = "audio/x-wav";
    public static final String AUDIO_MIDI = "audio/midi";
    public static final String AUDIO_MIDI_ALT = "audio/x-midi";

    public static final String[] IMAGE_EXTENSION = { "bmp", "gif", "jpg", "jpeg", "png" };
    public static final String[] FLASH_EXTENSION = { "swf", "flv" };
    public static final String[] MEDIA_EXTENSION = { "swf", "flv", "mp3", "wav", "wma", "wmv", "mid", "avi", "mpg", "asf", "rm", "rmvb" };
    public static final String[] DEFAULT_ALLOWED_EXTENSION = {
            "bmp", "gif", "jpg", "jpeg", "png",
            "doc", "docx", "xls", "xlsx", "ppt", "pptx", "html", "htm", "txt",
            "rar", "zip", "gz", "bz2",
            "mp4", "avi", "rmvb",
            "pdf" };

    private static final Map<String, Set<String>> DECLARED_CONTENT_TYPES = new HashMap<>();
    private static final Map<String, Set<String>> DETECTED_CONTENT_TYPES = new HashMap<>();
    private static final Set<String> OPTIONAL_DETECTED_CONTENT_TYPE_EXTENSIONS = Set.of("txt", "html", "htm");

    static {
        register("png", setOf(IMAGE_PNG, APPLICATION_OCTET_STREAM), setOf(IMAGE_PNG));
        register("jpg", setOf(IMAGE_JPG, IMAGE_JPEG, APPLICATION_OCTET_STREAM), setOf(IMAGE_JPEG));
        register("jpeg", setOf(IMAGE_JPEG, IMAGE_JPG, APPLICATION_OCTET_STREAM), setOf(IMAGE_JPEG));
        register("bmp", setOf(IMAGE_BMP, APPLICATION_OCTET_STREAM), setOf(IMAGE_BMP));
        register("gif", setOf(IMAGE_GIF, APPLICATION_OCTET_STREAM), setOf(IMAGE_GIF));
        register("pdf", setOf(APPLICATION_PDF, APPLICATION_OCTET_STREAM), setOf(APPLICATION_PDF));
        register("zip", setOf(APPLICATION_ZIP, APPLICATION_ZIP_COMPRESSED, APPLICATION_OCTET_STREAM), setOf(APPLICATION_ZIP));
        register("rar", setOf(APPLICATION_RAR, APPLICATION_RAR_COMPRESSED, APPLICATION_OCTET_STREAM), setOf(APPLICATION_RAR));
        register("gz", setOf(APPLICATION_GZIP, APPLICATION_GZIP_COMPRESSED, APPLICATION_OCTET_STREAM), setOf(APPLICATION_GZIP));
        register("bz2", setOf(APPLICATION_BZIP2, APPLICATION_OCTET_STREAM), setOf(APPLICATION_BZIP2));
        register("doc", setOf(APPLICATION_MSWORD, APPLICATION_OCTET_STREAM), setOf(APPLICATION_COMPOUND_FILE));
        register("xls", setOf(APPLICATION_MSEXCEL, APPLICATION_OCTET_STREAM), setOf(APPLICATION_COMPOUND_FILE));
        register("ppt", setOf(APPLICATION_MSPOWERPOINT, APPLICATION_OCTET_STREAM), setOf(APPLICATION_COMPOUND_FILE));
        register("docx", setOf(APPLICATION_DOCX, APPLICATION_OCTET_STREAM), setOf(APPLICATION_DOCX));
        register("xlsx", setOf(APPLICATION_XLSX, APPLICATION_OCTET_STREAM), setOf(APPLICATION_XLSX));
        register("pptx", setOf(APPLICATION_PPTX, APPLICATION_OCTET_STREAM), setOf(APPLICATION_PPTX));
        register("txt", setOf(TEXT_PLAIN), Collections.emptySet());
        register("html", setOf(TEXT_HTML), Collections.emptySet());
        register("htm", setOf(TEXT_HTML), Collections.emptySet());
        register("mp4", setOf(VIDEO_MP4, APPLICATION_OCTET_STREAM), setOf(VIDEO_MP4));
        register("avi", setOf(VIDEO_AVI, APPLICATION_OCTET_STREAM), setOf(VIDEO_AVI));
        register("rmvb", setOf(APPLICATION_REALMEDIA_VBR, APPLICATION_OCTET_STREAM), setOf(APPLICATION_REALMEDIA_VBR));
        register("swf", setOf(APPLICATION_FLASH, APPLICATION_OCTET_STREAM), setOf(APPLICATION_FLASH));
        register("flv", setOf(VIDEO_FLV, APPLICATION_OCTET_STREAM), setOf(VIDEO_FLV));
        register("wav", setOf(AUDIO_WAV, AUDIO_WAV_ALT, APPLICATION_OCTET_STREAM), setOf(AUDIO_WAV));
        register("wmv", setOf(VIDEO_WMV, APPLICATION_OCTET_STREAM), setOf(VIDEO_ASF));
        register("asf", setOf(VIDEO_ASF, APPLICATION_OCTET_STREAM), setOf(VIDEO_ASF));
        register("mid", setOf(AUDIO_MIDI, AUDIO_MIDI_ALT, APPLICATION_OCTET_STREAM), setOf(AUDIO_MIDI));
        register("rm", setOf(APPLICATION_REALMEDIA, APPLICATION_OCTET_STREAM), setOf(APPLICATION_REALMEDIA));
    }

    public static String getExtension(String contentType) {
        String normalized = normalizeContentType(contentType);
        if (StrUtil.isBlank(normalized)) {
            return "";
        }
        switch (normalized) {
            case IMAGE_PNG:
                return "png";
            case IMAGE_JPG:
            case IMAGE_JPEG:
                return "jpeg";
            case IMAGE_BMP:
                return "bmp";
            case IMAGE_GIF:
                return "gif";
            case APPLICATION_PDF:
                return "pdf";
            case APPLICATION_ZIP:
            case APPLICATION_ZIP_COMPRESSED:
                return "zip";
            case APPLICATION_RAR:
            case APPLICATION_RAR_COMPRESSED:
                return "rar";
            case APPLICATION_GZIP:
            case APPLICATION_GZIP_COMPRESSED:
                return "gz";
            case APPLICATION_BZIP2:
                return "bz2";
            case APPLICATION_MSWORD:
                return "doc";
            case APPLICATION_MSEXCEL:
                return "xls";
            case APPLICATION_MSPOWERPOINT:
                return "ppt";
            case APPLICATION_DOCX:
                return "docx";
            case APPLICATION_XLSX:
                return "xlsx";
            case APPLICATION_PPTX:
                return "pptx";
            case TEXT_PLAIN:
                return "txt";
            case TEXT_HTML:
                return "html";
            case VIDEO_MP4:
                return "mp4";
            case VIDEO_AVI:
                return "avi";
            case APPLICATION_REALMEDIA_VBR:
                return "rmvb";
            default:
                return "";
        }
    }

    public static String normalizeContentType(String contentType) {
        if (StrUtil.isBlank(contentType)) {
            return "";
        }
        String normalized = contentType.trim().toLowerCase(Locale.ROOT);
        int separatorIndex = normalized.indexOf(';');
        return separatorIndex >= 0 ? normalized.substring(0, separatorIndex).trim() : normalized;
    }

    public static String normalizeExtension(String extension) {
        if (StrUtil.isBlank(extension)) {
            return "";
        }
        String normalized = extension.trim().toLowerCase(Locale.ROOT);
        return normalized.startsWith(".") ? normalized.substring(1) : normalized;
    }

    public static boolean isAllowedDeclaredContentType(String extension, String contentType) {
        if (StrUtil.isBlank(contentType)) {
            return false;
        }
        Set<String> allowed = DECLARED_CONTENT_TYPES.get(normalizeExtension(extension));
        return allowed != null && allowed.contains(normalizeContentType(contentType));
    }

    public static boolean isAllowedDetectedContentType(String extension, String contentType) {
        String normalizedExtension = normalizeExtension(extension);
        Set<String> allowed = DETECTED_CONTENT_TYPES.get(normalizedExtension);
        if (allowed == null || allowed.isEmpty()) {
            return !requiresDetectedContentType(normalizedExtension);
        }
        if (StrUtil.isBlank(contentType)) {
            return false;
        }
        return allowed.contains(normalizeContentType(contentType));
    }

    public static boolean requiresDetectedContentType(String extension) {
        String normalizedExtension = normalizeExtension(extension);
        if (OPTIONAL_DETECTED_CONTENT_TYPE_EXTENSIONS.contains(normalizedExtension)) {
            return false;
        }
        Set<String> allowed = DETECTED_CONTENT_TYPES.get(normalizedExtension);
        return allowed != null && !allowed.isEmpty();
    }

    public static String resolveContentType(String extension, String declaredContentType, String detectedContentType) {
        String normalizedExtension = normalizeExtension(extension);
        String normalizedDeclared = normalizeContentType(declaredContentType);
        if (isAllowedDeclaredContentType(normalizedExtension, normalizedDeclared)
                && !APPLICATION_OCTET_STREAM.equals(normalizedDeclared)) {
            return normalizedDeclared;
        }

        String normalizedDetected = normalizeContentType(detectedContentType);
        if (isAllowedDetectedContentType(normalizedExtension, normalizedDetected)) {
            return normalizedDetected;
        }

        Set<String> declaredTypes = DECLARED_CONTENT_TYPES.get(normalizedExtension);
        if (declaredTypes != null) {
            for (String declaredType : declaredTypes) {
                if (!APPLICATION_OCTET_STREAM.equals(declaredType)) {
                    return declaredType;
                }
            }
        }

        return StrUtil.blankToDefault(normalizedDeclared,
                StrUtil.blankToDefault(normalizedDetected, APPLICATION_OCTET_STREAM));
    }

    private static void register(String extension, Set<String> declaredTypes, Set<String> detectedTypes) {
        DECLARED_CONTENT_TYPES.put(extension, declaredTypes);
        DETECTED_CONTENT_TYPES.put(extension, detectedTypes);
    }

    private static Set<String> setOf(String... values) {
        LinkedHashSet<String> set = new LinkedHashSet<>();
        for (String value : values) {
            if (StrUtil.isNotBlank(value)) {
                set.add(normalizeContentType(value));
            }
        }
        return Collections.unmodifiableSet(set);
    }
}
