package com.cloudflow.auth.printing;

import com.cloudflow.auth.domain.SysPrintTemplate;
import com.cloudflow.common.core.exception.ServiceException;
import com.openhtmltopdf.outputdevice.helper.BaseRendererBuilder;
import com.openhtmltopdf.outputdevice.helper.ExternalResourceControlPriority;
import com.openhtmltopdf.pdfboxout.PdfRendererBuilder;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.EnumSet;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Attribute;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.nodes.Entities;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

/** G5 HTML 转 PDF。业务权限和字段过滤由调用管线负责，渲染期间禁止一切 URI 资源读取。 */
@Component
public final class PrintPdfRenderer {
    private static final String FONT_PATH = "fonts/NotoSansSC-Regular.ttf";
    private static final String FONT_FAMILY = "Noto Sans SC";
    private static final int MAX_HTML_CHARS = 4194304;
    private static final int MAX_PDF_BYTES = 33554432;

    public byte[] render(String html, SysPrintTemplate template) {
        if (html == null || html.isBlank() || html.length() > MAX_HTML_CHARS) {
            throw new ServiceException("打印 HTML 不能为空且不能超过4194304个字符", 400);
        }
        String pageCss = pageCss(template);
        ClassPathResource font = new ClassPathResource(FONT_PATH);
        if (!font.exists()) throw new ServiceException("打印中文字体缺失，请联系管理员", 503);
        Document document = Jsoup.parse(html);
        document.select("script,iframe,frame,frameset,object,embed,applet,base,link,meta,form,input,button,textarea,select,svg,math")
                .remove();
        for (Element element : document.getAllElements()) {
            for (Attribute attribute : new ArrayList<>(element.attributes().asList())) {
                String key = attribute.getKey();
                if (key.startsWith("on") || key.equals("href") || key.equals("src") || key.equals("srcset")
                        || key.equals("poster") || key.equals("background") || key.equals("action")
                        || key.equals("formaction") || key.equals("data")) element.removeAttr(key);
            }
        }
        // 兜底字体放前面，模板可继续指定字号等样式；纸张配置放最后，边距和尺寸由模板设置控制。
        document.head().prependElement("style").text("body { font-family: '" + FONT_FAMILY + "'; }");
        document.head().appendElement("style").text(pageCss);
        document.outputSettings().syntax(Document.OutputSettings.Syntax.xml)
                .escapeMode(Entities.EscapeMode.xhtml).charset(StandardCharsets.UTF_8);
        try (BoundedOutput output = new BoundedOutput()) {
            PdfRendererBuilder builder = new PdfRendererBuilder();
            builder.useFastMode();
            builder.useFont(() -> {
                try { return font.getInputStream(); }
                catch (IOException failure) { throw new ServiceException("打印中文字体读取失败", 503); }
            }, FONT_FAMILY, 400, BaseRendererBuilder.FontStyle.NORMAL, true,
                    // 页脚的 CSS 生成文字不继承 body 字体；缺字时也须回退到内置中文字体。
                    EnumSet.of(BaseRendererBuilder.FSFontUseCase.DOCUMENT, BaseRendererBuilder.FSFontUseCase.FALLBACK_FINAL));
            // 双阶段按资源类型统一拒绝，覆盖 CSS import/url、图片及自定义协议；字体仅由上方流提供。
            builder.useExternalResourceAccessControl((uri, type) -> false,
                    ExternalResourceControlPriority.RUN_BEFORE_RESOLVING_URI);
            builder.useExternalResourceAccessControl((uri, type) -> false,
                    ExternalResourceControlPriority.RUN_AFTER_RESOLVING_URI);
            builder.useUriResolver((baseUri, uri) -> null);
            builder.withDiagnosticConsumer(diagnostic -> { });
            builder.withHtmlContent(document.outerHtml(), null);
            builder.toStream(output);
            builder.run();
            return output.toByteArray();
        } catch (IOException | RuntimeException failure) {
            // 不透出模板、业务数据、资源地址及底层异常详情。
            throw new ServiceException("PDF 生成失败，请检查模板版式及纸张设置", 400);
        }
    }

    private static String pageCss(SysPrintTemplate template) {
        if (template == null) throw invalidPaper();
        BigDecimal width;
        BigDecimal height;
        String paper = template.getPaperSize() == null ? "A4" : template.getPaperSize();
        switch (paper) {
            case "A4" -> { width = new BigDecimal("210"); height = new BigDecimal("297"); }
            case "A5" -> { width = new BigDecimal("148"); height = new BigDecimal("210"); }
            case "LETTER" -> { width = new BigDecimal("215.9"); height = new BigDecimal("279.4"); }
            case "CUSTOM" -> {
                width = dimension(template.getPaperWidthMm());
                height = dimension(template.getPaperHeightMm());
            }
            default -> throw invalidPaper();
        }
        String orientation = template.getOrientation() == null ? "PORTRAIT" : template.getOrientation();
        if ("LANDSCAPE".equals(orientation)) { BigDecimal swap = width; width = height; height = swap; }
        else if (!"PORTRAIT".equals(orientation)) throw invalidPaper();
        BigDecimal top = margin(template.getMarginTop());
        BigDecimal bottom = margin(template.getMarginBottom());
        BigDecimal left = margin(template.getMarginLeft());
        BigDecimal right = margin(template.getMarginRight());
        if (top.add(bottom).compareTo(height) >= 0 || left.add(right).compareTo(width) >= 0) throw invalidPaper();
        return "@page { size: " + width.toPlainString() + "mm " + height.toPlainString()
                + "mm; margin: " + top.toPlainString() + "mm " + right.toPlainString() + "mm "
                + bottom.toPlainString() + "mm " + left.toPlainString() + "mm; }";
    }

    private static BigDecimal dimension(BigDecimal value) {
        if (value == null || value.signum() <= 0) throw invalidPaper();
        return validateNumber(value);
    }

    private static BigDecimal margin(BigDecimal value) {
        return validateNumber(value == null ? BigDecimal.TEN : value);
    }

    private static BigDecimal validateNumber(BigDecimal value) {
        if (value.signum() < 0 || value.compareTo(new BigDecimal("9999.99")) > 0
                || value.stripTrailingZeros().scale() > 2) throw invalidPaper();
        return value;
    }

    private static ServiceException invalidPaper() { return new ServiceException("打印纸张或边距设置无效", 400); }

    private static final class BoundedOutput extends ByteArrayOutputStream {
        @Override public synchronized void write(byte[] bytes, int offset, int length) {
            if (length > MAX_PDF_BYTES - count) throw new IllegalStateException("PDF 输出超过33554432字节");
            super.write(bytes, offset, length);
        }
        @Override public synchronized void write(int value) {
            if (count >= MAX_PDF_BYTES) throw new IllegalStateException("PDF 输出超过33554432字节");
            super.write(value);
        }
    }
}
