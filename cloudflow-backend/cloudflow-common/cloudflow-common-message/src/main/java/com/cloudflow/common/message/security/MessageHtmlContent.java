package com.cloudflow.common.message.security;

import java.io.StringReader;
import java.net.URI;
import java.util.Set;
import java.util.function.UnaryOperator;
import javax.swing.text.MutableAttributeSet;
import javax.swing.text.html.HTML;
import javax.swing.text.html.HTMLEditorKit;
import javax.swing.text.html.parser.ParserDelegator;

public final class MessageHtmlContent {
    private static final Set<String> TAGS = Set.of("p", "br", "b", "strong", "i", "em", "u", "ul", "ol", "li",
            "table", "thead", "tbody", "tr", "td", "th", "h1", "h2", "h3", "a", "img", "div", "span", "blockquote");
    private static final Set<String> BLOCKED = Set.of("script", "style", "iframe", "object", "form", "svg", "math");

    private MessageHtmlContent() { }

    public static String clean(String input) { return rewrite(input, UnaryOperator.identity(), UnaryOperator.identity()); }

    public static String rewrite(String input, UnaryOperator<String> links, UnaryOperator<String> images) {
        if (input == null) return "";
        if (input.length() > 1_048_576 || links == null || images == null) throw new IllegalArgumentException("MAIL_HTML_INVALID");
        StringBuilder html = new StringBuilder();
        boolean[] rejected = {false};
        try {
            new ParserDelegator().parse(new StringReader(input), new HTMLEditorKit.ParserCallback() {
                private int blocked;

                @Override
                public void handleStartTag(HTML.Tag tag, MutableAttributeSet attributes, int position) {
                    if (BLOCKED.contains(tag.toString())) { blocked++; return; }
                    if (blocked == 0) append(tag, attributes);
                }

                @Override
                public void handleSimpleTag(HTML.Tag tag, MutableAttributeSet attributes, int position) {
                    if (blocked == 0 && !BLOCKED.contains(tag.toString())) append(tag, attributes);
                }

                @Override
                public void handleEndTag(HTML.Tag tag, int position) {
                    if (BLOCKED.contains(tag.toString())) { blocked = Math.max(0, blocked - 1); return; }
                    if (blocked == 0 && TAGS.contains(tag.toString())) html.append("</").append(tag).append('>');
                }

                @Override
                public void handleText(char[] data, int position) {
                    if (blocked == 0) html.append(escape(new String(data)));
                }

                private void append(HTML.Tag tag, MutableAttributeSet attributes) {
                    if (!TAGS.contains(tag.toString())) return;
                    html.append('<').append(tag);
                    if (tag == HTML.Tag.A) attribute(attributes, HTML.Attribute.HREF, links);
                    if (tag == HTML.Tag.IMG) {
                        attribute(attributes, HTML.Attribute.SRC, images);
                        attribute(attributes, HTML.Attribute.ALT, null);
                    }
                    html.append('>');
                }

                private void attribute(MutableAttributeSet attributes, HTML.Attribute key, UnaryOperator<String> transform) {
                    Object source = attributes.getAttribute(key);
                    if (source == null) return;
                    String value = source.toString();
                    if (value.length() > 2000 || transform != null && !safeLink(value)) return;
                    if (transform != null) {
                        try { value = transform.apply(value); }
                        catch (RuntimeException invalid) { rejected[0] = true; return; }
                    }
                    if (value == null || value.length() > 2000 || transform != null && !safeLink(value)) return;
                    html.append(' ').append(key).append("=\"").append(escape(value)).append('"');
                }
            }, true);
            if (rejected[0]) throw new IllegalArgumentException("MAIL_HTML_INVALID");
            return html.toString();
        } catch (Exception failure) {
            throw new IllegalArgumentException("MAIL_HTML_INVALID");
        }
    }

    private static boolean safeLink(String value) {
        try {
            URI uri = URI.create(value);
            return "https".equalsIgnoreCase(uri.getScheme()) && uri.getHost() != null && uri.getUserInfo() == null
                    && value.chars().noneMatch(character -> character <= 32 || character == 127)
                    && !value.toLowerCase(java.util.Locale.ROOT).matches(".*%(?:0[ad]|25).*");
        } catch (RuntimeException failure) { return false; }
    }

    private static String escape(String value) {
        return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                .replace("\"", "&quot;").replace("'", "&#39;");
    }
}
