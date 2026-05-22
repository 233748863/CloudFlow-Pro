package com.cloudflow.hr.service;

import com.cloudflow.hr.exception.HrBusinessException;
import com.openhtmltopdf.outputdevice.helper.BaseRendererBuilder;
import com.openhtmltopdf.pdfboxout.PdfRendererBuilder;
import lombok.extern.slf4j.Slf4j;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Entities;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * HR PDF 渲染器：基于 openhtmltopdf，把内嵌的 HTML 模板填好变量后渲染成 PDF byte[]。
 *
 * <p>中文支持：优先加载 classpath 下 fonts/NotoSansCJKsc-Regular.otf（如部署时随包发布），
 * 找不到时回退到 jdk 自带 sans-serif 渲染（生产环境若 Linux 无安装中文字体，需补充字体文件，
 * 字体文件挂在 {@code cloudflow-service-hr/src/main/resources/fonts/} 即可）。
 */
@Slf4j
@Service
public class HrPdfRenderer {

    private static final String FONT_CLASSPATH = "fonts/NotoSansCJKsc-Regular.otf";
    private static final String FONT_FAMILY = "Noto Sans CJK SC";

    /**
     * 把一段 HTML（可能不严格 XHTML）渲染为 PDF。
     */
    public byte[] render(String rawHtml) {
        String xhtml = toXhtml(rawHtml);
        try (ByteArrayOutputStream os = new ByteArrayOutputStream(64 * 1024)) {
            PdfRendererBuilder builder = new PdfRendererBuilder();
            registerFonts(builder);
            builder.useFastMode();
            builder.withHtmlContent(xhtml, null);
            builder.toStream(os);
            builder.run();
            return os.toByteArray();
        } catch (IOException e) {
            throw new HrBusinessException("PDF_RENDER_FAILED", "PDF 渲染失败：" + e.getMessage());
        }
    }

    /**
     * 把简单的 {{key}} 占位符替换为 escaped 值，便于业务模板直接拼字符串。
     */
    public String fillTemplate(String template, Map<String, Object> variables) {
        if (template == null) {
            return "";
        }
        if (variables == null || variables.isEmpty()) {
            return template;
        }
        String result = template;
        for (Map.Entry<String, Object> entry : variables.entrySet()) {
            String placeholder = "{{" + entry.getKey() + "}}";
            String value = entry.getValue() == null ? "" : Entities.escape(String.valueOf(entry.getValue()));
            result = result.replace(placeholder, value);
        }
        return result;
    }

    /**
     * 默认证明 HTML 模板，跨子模板复用版式 + 留 {{var}} 占位符。
     */
    public String defaultCertificateTemplate() {
        return TEMPLATE_CERTIFICATE;
    }

    public String defaultTrainingCertificateTemplate() {
        return TEMPLATE_TRAINING_CERTIFICATE;
    }

    private void registerFonts(PdfRendererBuilder builder) {
        ClassPathResource resource = new ClassPathResource(FONT_CLASSPATH);
        if (!resource.exists()) {
            log.warn("HR PDF 字体文件不存在（路径 {}），将依赖 JVM/OS 默认字体；中文可能乱码。", FONT_CLASSPATH);
            return;
        }
        builder.useFont(() -> {
            try {
                return resource.getInputStream();
            } catch (IOException e) {
                throw new HrBusinessException("PDF_FONT_LOAD_FAILED", "加载字体失败：" + e.getMessage());
            }
        }, FONT_FAMILY, 400, BaseRendererBuilder.FontStyle.NORMAL, true);
    }

    private String toXhtml(String html) {
        Document document = Jsoup.parse(html == null ? "" : html);
        document.outputSettings()
                .syntax(Document.OutputSettings.Syntax.xml)
                .escapeMode(Entities.EscapeMode.xhtml)
                .charset(StandardCharsets.UTF_8);
        return document.outerHtml();
    }

    static Map<String, Object> demoVariables() {
        // 仅供本地手工渲染时使用，业务侧调用 fillTemplate 自行注入。
        Map<String, Object> vars = new LinkedHashMap<>();
        vars.put("title", "在职证明");
        return vars;
    }

    /**
     * 通用证明模板（在职证明 / 收入证明 / 社保证明 / 自定义证明 五合一），通过 title/body 占位实现。
     */
    private static final String TEMPLATE_CERTIFICATE = """
            <!DOCTYPE html>
            <html><head>
              <meta charset="UTF-8"/>
              <style>
                @page { size: A4; margin: 24mm 22mm; }
                body { font-family: "Noto Sans CJK SC", "SimSun", sans-serif; font-size: 12pt; color: #222; }
                h1 { text-align: center; font-size: 22pt; letter-spacing: 4pt; margin: 12pt 0 24pt; }
                .meta { text-align: right; color: #555; font-size: 10pt; margin-bottom: 18pt; }
                .body p { line-height: 1.85; text-indent: 2em; margin: 0 0 6pt; }
                .seal { margin-top: 60pt; text-align: right; }
                .seal .row { line-height: 1.85; }
              </style>
            </head><body>
              <div class="meta">编号：{{requestNo}}</div>
              <h1>{{title}}</h1>
              <div class="body">
                <p>兹证明 {{employeeName}}（员工编号 {{employeeNo}}）系本公司员工，目前担任 {{positionName}} 一职，所在部门 {{deptName}}。</p>
                <p>{{body}}</p>
                <p>特此证明。</p>
              </div>
              <div class="seal">
                <div class="row">{{companyName}}</div>
                <div class="row">{{issueDate}}</div>
              </div>
            </body></html>
            """;

    /**
     * 培训证书模板。
     */
    private static final String TEMPLATE_TRAINING_CERTIFICATE = """
            <!DOCTYPE html>
            <html><head>
              <meta charset="UTF-8"/>
              <style>
                @page { size: A4 landscape; margin: 18mm 22mm; }
                body { font-family: "Noto Sans CJK SC", "SimSun", sans-serif; color: #1f2a3a; }
                .frame { border: 6pt double #b08d57; padding: 28pt 28pt 36pt; min-height: 165mm; text-align: center; }
                .frame h1 { font-size: 30pt; letter-spacing: 8pt; margin: 18pt 0 0; }
                .frame .sub { font-size: 14pt; color: #6c5530; letter-spacing: 4pt; margin-bottom: 28pt; }
                .frame .name { font-size: 22pt; margin: 12pt 0; }
                .frame .desc { font-size: 14pt; line-height: 1.9; margin: 0 36pt; }
                .frame .footer { display: flex; justify-content: space-between; margin-top: 32pt; font-size: 11pt; color: #555; }
                .frame .footer .item { flex: 1; }
              </style>
            </head><body>
              <div class="frame">
                <h1>培训证书</h1>
                <div class="sub">CERTIFICATE OF COMPLETION</div>
                <div class="desc">兹证明</div>
                <div class="name">{{employeeName}}</div>
                <div class="desc">于 {{startDate}} 至 {{endDate}} 期间完成《{{courseName}}》培训课程的全部学习内容，学时 {{creditHours}} 课时，考核结果合格，特发此证。</div>
                <div class="footer">
                  <div class="item">证书编号：{{certNo}}</div>
                  <div class="item">颁发机构：{{companyName}}</div>
                  <div class="item">颁发日期：{{issueDate}}</div>
                </div>
              </div>
            </body></html>
            """;

    InputStream openFontStream() throws IOException {
        return new ClassPathResource(FONT_CLASSPATH).getInputStream();
    }

    static byte[] readFully(InputStream in) throws IOException {
        try (ByteArrayInputStream ignored = null) {
            ByteArrayOutputStream out = new ByteArrayOutputStream(8192);
            byte[] buf = new byte[8192];
            int read;
            while ((read = in.read(buf)) != -1) {
                out.write(buf, 0, read);
            }
            return out.toByteArray();
        }
    }
}
