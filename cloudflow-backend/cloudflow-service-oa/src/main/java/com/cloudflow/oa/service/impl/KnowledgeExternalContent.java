package com.cloudflow.oa.service.impl;

import com.cloudflow.common.core.exception.ServiceException;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.safety.Cleaner;
import org.jsoup.safety.Safelist;

public final class KnowledgeExternalContent {
    private static final Safelist ELEMENTS = Safelist.none().addTags("p", "br", "b", "strong", "i", "em", "u", "ul", "ol", "li",
            "table", "thead", "tbody", "tr", "td", "th", "h1", "h2", "h3", "div", "span", "blockquote");

    private KnowledgeExternalContent() { }

    public static String clean(String content) {
        if (content == null || content.isBlank() || content.length() > 1_048_576) {
            throw new ServiceException("对外知识正文须为1至1048576字符", 400);
        }
        try {
            Document parsed = Jsoup.parseBodyFragment(content);
            parsed.select("script,style,iframe,object,embed,form,svg,math,template,noscript").remove();
            Document clean = new Cleaner(ELEMENTS).clean(parsed);
            clean.outputSettings().prettyPrint(false);
            return clean.body().html();
        } catch (IllegalArgumentException invalid) {
            throw new ServiceException("无法安全处理对外知识正文", 400);
        }
    }
}
