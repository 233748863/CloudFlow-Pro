package com.cloudflow.oa.service.impl;

import com.cloudflow.common.core.exception.ServiceException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class KnowledgeAttachmentRules {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Pattern REFERENCE = Pattern.compile("/api/auth/system/file/([1-9][0-9]{0,18})/content");
    public static final int MAX_ATTACHMENTS = 5;

    private KnowledgeAttachmentRules() { }

    public static List<Long> references(String value) {
        if (value == null || value.isBlank()) return List.of();
        if (value.length() > 1000) return List.of();
        Set<Long> result = new LinkedHashSet<>();
        String[] references = value.split(",");
        if (references.length > MAX_ATTACHMENTS) return List.of();
        for (String reference : references) {
            Matcher match = REFERENCE.matcher(reference.trim());
            if (match.matches()) {
                try { result.add(Long.valueOf(match.group(1))); }
                catch (NumberFormatException invalid) { }
            }
        }
        return List.copyOf(result);
    }

    public static List<Long> selection(String value) {
        if (value == null) return List.of();
        try {
            if (value.length() > 256) throw invalid();
            JsonNode values = JSON.readTree(value);
            if (values == null || !values.isArray() || values.size() > MAX_ATTACHMENTS) throw invalid();
            List<Long> ids = new ArrayList<>();
            for (JsonNode item : values) {
                if (!item.isIntegralNumber() || !item.canConvertToLong()) throw invalid();
                ids.add(item.longValue());
            }
            return validate(ids);
        } catch (java.io.IOException failure) { throw invalid(); }
    }

    public static List<Long> validate(List<Long> ids) {
        if (ids == null || ids.size() > MAX_ATTACHMENTS || ids.stream().anyMatch(id -> id == null || id <= 0)
                || new LinkedHashSet<>(ids).size() != ids.size()) throw invalid();
        return ids.stream().sorted().toList();
    }

    public static String encode(List<Long> ids) { return validate(ids).toString(); }

    private static ServiceException invalid() { return new ServiceException("公开附件清单须为最多5个不重复的有效文件编号", 400); }
}
