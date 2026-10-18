package com.cloudflow.common.core.search;

import com.cloudflow.common.core.exception.ServiceException;

public record BusinessSearchQuery(String keyword, int limitPerType) {
    public BusinessSearchQuery {
        if (keyword == null) throw new ServiceException("请输入2至64个字符的搜索关键词", 400);
        keyword = keyword.strip();
        int length = keyword.codePointCount(0, keyword.length());
        if (length < 2 || length > 64 || keyword.codePoints().anyMatch(codePoint -> Character.isISOControl(codePoint)
                || codePoint >= Character.MIN_SURROGATE && codePoint <= Character.MAX_SURROGATE)) {
            throw new ServiceException("搜索关键词须为2至64个有效字符", 400);
        }
        if (limitPerType < 1 || limitPerType > 10) throw new ServiceException("每类搜索结果须为1至10条", 400);
    }

    public String pattern() {
        return "%" + keyword.replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%";
    }
}
