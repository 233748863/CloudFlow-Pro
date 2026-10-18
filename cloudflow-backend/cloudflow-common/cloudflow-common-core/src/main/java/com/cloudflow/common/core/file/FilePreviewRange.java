package com.cloudflow.common.core.file;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

public record FilePreviewRange(int start, int length, boolean partial) {
    private static final Pattern SINGLE = Pattern.compile("bytes=([0-9]{0,18})-([0-9]{0,18})");

    public static FilePreviewRange parse(String header, int size) {
        if (size <= 0 || size > FilePreviewContent.MAX_BYTES) throw invalid();
        if (header == null) return new FilePreviewRange(0, size, false);
        Matcher range = SINGLE.matcher(header);
        if (!range.matches() || range.group(1).isEmpty() && range.group(2).isEmpty()) throw invalid();
        try {
            if (range.group(1).isEmpty()) {
                long suffix = Long.parseLong(range.group(2));
                if (suffix <= 0) throw invalid();
                int length = (int) Math.min(suffix, size);
                return new FilePreviewRange(size - length, length, true);
            }
            long start = Long.parseLong(range.group(1));
            long end = range.group(2).isEmpty() ? size - 1L : Long.parseLong(range.group(2));
            if (start >= size || end < start) throw invalid();
            return new FilePreviewRange((int) start, (int) (Math.min(end, size - 1L) - start + 1), true);
        } catch (NumberFormatException failure) { throw invalid(); }
    }

    public String contentRange(int size) { return "bytes " + start + "-" + (start + length - 1) + "/" + size; }

    private static IllegalArgumentException invalid() { return new IllegalArgumentException("附件分段读取范围无效"); }
}
