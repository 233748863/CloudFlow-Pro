package com.cloudflow.oa.util;

import org.springframework.util.StringUtils;

import java.util.LinkedHashSet;
import java.util.Set;

public final class OaAttachmentUrlUtils {

    public static final int DEFAULT_MAX_ATTACHMENT_COUNT = 5;
    public static final int DEFAULT_MAX_URL_FIELD_LENGTH = 1000;

    private OaAttachmentUrlUtils() {
    }

    public static String normalizeMultiAttachmentUrls(String raw, String fieldLabel) {
        if (!StringUtils.hasText(raw)) {
            return null;
        }

        String label = StringUtils.hasText(fieldLabel) ? fieldLabel.trim() : "附件";
        Set<String> normalizedUrls = new LinkedHashSet<>();
        for (String part : raw.split(",")) {
            String trimmed = part == null ? "" : part.trim();
            if (!trimmed.isEmpty()) {
                normalizedUrls.add(trimmed);
            }
        }

        if (normalizedUrls.isEmpty()) {
            return null;
        }

        if (normalizedUrls.size() > DEFAULT_MAX_ATTACHMENT_COUNT) {
            throw new IllegalArgumentException(label + "最多上传 " + DEFAULT_MAX_ATTACHMENT_COUNT + " 个文件");
        }

        String joined = String.join(",", normalizedUrls);
        if (joined.length() > DEFAULT_MAX_URL_FIELD_LENGTH) {
            throw new IllegalArgumentException(label + "总长度不能超过 " + DEFAULT_MAX_URL_FIELD_LENGTH + " 个字符");
        }

        return joined;
    }
}
