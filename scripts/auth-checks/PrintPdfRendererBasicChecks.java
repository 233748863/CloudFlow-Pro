package com.cloudflow.auth.checks;

import com.cloudflow.auth.domain.SysPrintTemplate;
import com.cloudflow.auth.printing.PrintPdfRenderer;
import com.cloudflow.common.core.exception.ServiceException;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.math.BigDecimal;
import java.net.InetSocketAddress;
import java.util.concurrent.atomic.AtomicInteger;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.text.PDFTextStripper;

/** 仅检查本次 PDF 核心；内存生成文件，不启动业务服务或访问业务数据库。 */
public final class PrintPdfRendererBasicChecks {
    private static int checks;

    public static void main(String[] arguments) throws IOException {
        PrintPdfRenderer renderer = new PrintPdfRenderer();
        AtomicInteger requests = new AtomicInteger();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/resource", exchange -> {
            requests.incrementAndGet();
            exchange.sendResponseHeaders(204, -1);
            exchange.close();
        });
        server.start();
        try {
            String uri = "http://127.0.0.1:" + server.getAddress().getPort() + "/resource";
            String html = "<html><head><style>@import url('" + uri + "');"
                    + "@page { @top-center { content: element(header); }"
                    + "@bottom-center { content: 'Page ' counter(page); } }"
                    + ".header { position: running(header); }"
                    + ".next { page-break-before: always; }"
                    + "body { background-image: url('" + uri + "'); }</style></head>"
                    + "<body><div class='header'>Print Header</div>"
                    + "<script>throw new Error('script must not run')</script>"
                    + "<img src='" + uri + "'><p>工资条 基本工资：1,234.50 元</p>"
                    + "<p class='next'>第二页 报销单</p></body></html>";
            byte[] pdf = renderer.render(html, paper("A4", "PORTRAIT"));
            expect(pdf.length > 1000 && pdf[0] == '%' && pdf[1] == 'P', "生成 PDF 文件");
            try (PDDocument document = PDDocument.load(pdf)) {
                expect(document.getNumberOfPages() == 2, "CSS 分页控制");
                String text = new PDFTextStripper().getText(document);
                expect(text.contains("工资条") && text.contains("第二页"), "内置字体中文可提取");
                expect(text.contains("Print") && text.contains("Header"), "页眉内容");
                expect(text.contains("Page 1") && text.contains("Page 2"), "页脚及页码");
                PDRectangle size = document.getPage(0).getMediaBox();
                expect(close(size.getWidth(), 210) && close(size.getHeight(), 297), "A4 纸张尺寸");
            }
            expect(requests.get() == 0, "HTML 图片及 CSS 外部资源未读取");
            try (PDDocument document = PDDocument.load(renderer.render("<p>横向 Letter</p>", paper("LETTER", "LANDSCAPE")))) {
                PDRectangle size = document.getPage(0).getMediaBox();
                expect(close(size.getWidth(), 279.4) && close(size.getHeight(), 215.9), "Letter 横向尺寸");
            }
            SysPrintTemplate custom = paper("CUSTOM", "PORTRAIT");
            custom.setPaperWidthMm(new BigDecimal("100"));
            custom.setPaperHeightMm(new BigDecimal("150"));
            try (PDDocument document = PDDocument.load(renderer.render("<p>自定义纸张</p>", custom))) {
                PDRectangle size = document.getPage(0).getMediaBox();
                expect(close(size.getWidth(), 100) && close(size.getHeight(), 150), "自定义纸张");
            }
            rejected(() -> renderer.render(" ", custom), "空内容校验");
            custom.setMarginLeft(new BigDecimal("100"));
            rejected(() -> renderer.render("<p>内容</p>", custom), "无有效打印区域校验");
            rejected(() -> renderer.render("<p>内容</p>", null), "缺少纸张配置校验");
            System.out.println("PrintPdfRendererBasicChecks PASS checks=" + checks);
        } finally { server.stop(0); }
    }

    private static SysPrintTemplate paper(String size, String orientation) {
        SysPrintTemplate template = new SysPrintTemplate();
        template.setPaperSize(size);
        template.setOrientation(orientation);
        return template;
    }

    private static boolean close(float points, double mm) { return Math.abs(points - mm * 72 / 25.4) < 0.5; }
    private static void expect(boolean passed, String description) {
        if (!passed) throw new AssertionError(description);
        checks++;
    }
    private static void rejected(Runnable action, String description) {
        try { action.run(); } catch (ServiceException expected) { checks++; return; }
        throw new AssertionError(description);
    }
}
