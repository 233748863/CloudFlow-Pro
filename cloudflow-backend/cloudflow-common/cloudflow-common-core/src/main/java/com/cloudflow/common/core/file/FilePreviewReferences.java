package com.cloudflow.common.core.file;

import com.cloudflow.common.core.exception.ServiceException;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.List;
import java.util.Objects;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class FilePreviewReferences {
    private static final List<String> ACCESS_PREFIXES = List.of("/api/auth/system/file/access?path=", "/auth/system/file/access?path=");
    private static final Pattern CONTENT = Pattern.compile("(?:/api)?/auth/system/file/([1-9][0-9]{0,18})/content");
    private static final Pattern PRIVATE = Pattern.compile("oa-file:(?:CONTRACT_EVIDENCE|CONTRACT_SIGNED|RFQ_INVITATION|RFQ_QUOTATION):([1-9][0-9]{0,18})");

    private FilePreviewReferences() { }

    public static List<String> split(String value) {
        return value == null ? List.of() : Arrays.stream(value.split(",")).map(String::trim).filter(item -> !item.isEmpty()).toList();
    }

    public static String normalize(String value) {
        if (value == null || value.isBlank() || value.length() > 4096) throw denied();
        String normalized = value.trim();
        for (int depth = 0; depth < 3; depth++) {
            String current = normalized;
            String prefix = ACCESS_PREFIXES.stream().filter(current::startsWith).findFirst().orElse(null);
            if (prefix == null) break;
            try { normalized = URLDecoder.decode(normalized.substring(prefix.length()), StandardCharsets.UTF_8); }
            catch (IllegalArgumentException failure) { throw denied(); }
        }
        if (normalized.isBlank() || normalized.chars().anyMatch(character -> character < 32 || character == 127)) throw denied();
        return normalized.startsWith("/auth/system/file/") ? "/api" + normalized : normalized;
    }

    public static Long fileId(String reference) {
        String normalized = normalize(reference);
        Matcher matcher = CONTENT.matcher(normalized);
        if (!matcher.matches()) matcher = PRIVATE.matcher(normalized);
        if (!matcher.matches()) return null;
        try { return Long.valueOf(matcher.group(1)); }
        catch (NumberFormatException failure) { throw denied(); }
    }

    public static String choose(FilePreviewRequest request, List<String> references) {
        request.validated();
        String expected = request.reference() == null ? null : normalize(request.reference());
        if (references != null) for (String value : references) {
            if (value == null || value.isBlank()) continue;
            String actual = normalize(value);
            Long actualId = fileId(actual);
            if (expected != null && !expected.equals(actual)) continue;
            if (request.fileId() != null && actualId != null && !Objects.equals(actualId, request.fileId())) continue;
            if (expected == null && !Objects.equals(actualId, request.fileId())) continue;
            return actual;
        }
        throw denied();
    }

    public static ServiceException denied() { return new ServiceException("附件不在当前业务记录的授权范围内", 403); }
}
