package com.cloudflow.auth.checks;

import com.cloudflow.auth.domain.SysPrintTemplate;
import com.cloudflow.auth.printing.PrintPdfRenderer;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.imageio.ImageIO;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.rendering.ImageType;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.pdfbox.text.TextPosition;

/** 一个固定长表样本，补验实际部署的中文、边距及自然分页，不访问业务系统。 */
public final class PrintPdfLayoutChecks {
    private static final int ROWS = 48;
    private static final float DPI = 120;
    private static int checks;
    private static final List<String> failures = new ArrayList<>();

    public static void main(String[] arguments) throws IOException {
        boolean existing = arguments.length == 2 && "--existing-pdf".equals(arguments[1]);
        if (arguments.length != 1 && !existing) throw new IllegalArgumentException("output directory required");
        Path output = Path.of(arguments[0]);
        if (!existing && Files.exists(output.resolve("layout.pdf"))) throw new IllegalStateException("sample already exists");
        SysPrintTemplate template = new SysPrintTemplate();
        template.setPaperSize("A4");
        template.setOrientation("PORTRAIT");
        template.setMarginTop(new BigDecimal("20"));
        template.setMarginBottom(new BigDecimal("18"));
        template.setMarginLeft(new BigDecimal("17"));
        template.setMarginRight(new BigDecimal("19"));
        String html = sample();
        byte[] bytes;
        if (existing) {
            expect(Files.readString(output.resolve("sample.html"), StandardCharsets.UTF_8).equals(html), "existing sample input unchanged");
            bytes = Files.readAllBytes(output.resolve("layout.pdf"));
        } else {
            bytes = new PrintPdfRenderer().render(html, template);
            Files.write(output.resolve("layout.pdf"), bytes);
            Files.writeString(output.resolve("sample.html"), html, StandardCharsets.UTF_8);
        }
        try (PDDocument document = PDDocument.load(bytes)) {
            int pages = document.getNumberOfPages();
            expect(pages == 3, "48-row sample naturally occupies three pages including cell padding and borders");
            List<String> texts = new ArrayList<>();
            StringBuilder measurements = new StringBuilder();
            PDFRenderer renderer = new PDFRenderer(document);
            for (int index = 0; index < pages; index++) {
                PDPage page = document.getPage(index);
                PDRectangle size = page.getMediaBox();
                expect(close(size.getWidth(), 210) && close(size.getHeight(), 297), "A4 media box");
                Positions stripper = new Positions();
                stripper.setStartPage(index + 1);
                stripper.setEndPage(index + 1);
                String text = stripper.getText(document);
                texts.add(text);
                Files.writeString(output.resolve("page-" + (index + 1) + ".txt"), text, StandardCharsets.UTF_8);
                String compact = text.replaceAll("\\s+", "");
                expect(compact.contains("云流业务单据") && compact.contains("版式验收"), "Chinese running header on each page");
                expect(compact.contains("第" + (index + 1) + "页，共" + pages + "页"), "current and total page numbers");
                expect(compact.contains("明细编号") && compact.contains("项目说明"), "repeated table header");
                expect(!text.contains("\uFFFD") && !text.contains("\u25A1"), "no replacement glyphs");
                boolean embedded = false;
                for (COSName name : page.getResources().getFontNames()) {
                    PDFont font = page.getResources().getFont(name);
                    if (font.getName().contains("NotoSansSC")) {
                        expect(font.isEmbedded(), "Chinese font embedded in page resources");
                        embedded = true;
                    }
                }
                expect(embedded, "Noto Sans SC used on each page");
                int detailLines = 0;
                for (Line line : stripper.lines) {
                    String value = line.text.replaceAll("\\s+", "");
                    if (value.contains("云流业务单据") && value.contains("版式验收")) expect(line.y < points(20), "header inside top margin");
                    if (value.startsWith("第") && value.contains("页，共")) expect(line.y > points(279), "footer inside configured bottom margin");
                    if (Pattern.compile("R\\d{3}").matcher(value).find()) {
                        detailLines++;
                        expect(line.x >= points(17) - 0.5 && line.right <= points(191) + 0.5,
                                "detail within left/right margins");
                        expect(line.y > points(20) && line.y + 3 < points(279), "detail above configured bottom margin");
                    }
                }
                expect(detailLines > 0, "each page contains natural table rows");
                BufferedImage image = renderer.renderImageWithDPI(index, DPI, ImageType.RGB);
                expect(ImageIO.write(image, "jpg", output.resolve("page-" + (index + 1) + ".jpg").toFile()), "JPG exported for visual review");
                if (index == 0) {
                    int y = pixels(20.5);
                    int left = firstDark(image, y, true);
                    int right = firstDark(image, y, false);
                    int top = 0;
                    while (top < image.getHeight() && !(dark(image.getRGB(pixels(18), top))
                            && dark(image.getRGB(pixels(100), top)) && dark(image.getRGB(pixels(190), top)))) top++;
                    expect(Math.abs(left - pixels(17)) <= 2, "17mm left margin measured from solid content edge");
                    expect(Math.abs(right + 1 - pixels(191)) <= 2, "19mm right margin measured from solid content edge");
                    expect(Math.abs(top - pixels(20)) <= 2, "20mm top margin measured from solid content edge");
                    measurements.append(String.format(Locale.ROOT, "\"contentEdgePixels\":{\"left\":%d,\"rightExclusive\":%d,\"top\":%d},", left, right + 1, top));
                }
            }
            String all = String.join("\n", texts);
            int last = -1;
            for (int number = 1; number <= ROWS; number++) {
                String marker = String.format(Locale.ROOT, "R%03d", number);
                Matcher matcher = Pattern.compile(marker).matcher(all);
                boolean found = matcher.find();
                expect(found, "row preserved: " + marker);
                if (!found) continue;
                int position = matcher.start();
                expect(position > last && !matcher.find(), "row ordered and appears once: " + marker);
                last = position;
            }
            expect(texts.get(0).contains("中文长表自然分页核定") && texts.get(pages - 1).contains("验收样本结束"), "first title and final Chinese summary preserved");
            String result = "{\"passed\":" + failures.isEmpty() + ",\"pages\":" + pages + ",\"rows\":" + ROWS + ",\"assertions\":" + checks
                    + ",\"dpi\":120,\"paperMm\":[210,297],\"marginsMm\":{\"top\":20,\"bottom\":18,\"left\":17,\"right\":19},"
                    + measurements + "\"manualPageBreak\":false,\"visualReview\":\"pending\"}";
            Files.writeString(output.resolve("result.json"), result, StandardCharsets.UTF_8);
            if (!failures.isEmpty()) throw new AssertionError(String.join("; ", failures));
            System.out.println("PRINT_PDF_LAYOUT_CHECKS: pages=" + pages + "; rows=" + ROWS + "; assertions=" + checks
                    + "; manual_page_break=false; database_writes=0; service_restarts=0");
        }
    }

    private static String sample() {
        StringBuilder html = new StringBuilder("<html><head><style>"
                + "@page{font-family:'Noto Sans SC';font-size:9pt;@top-center{content:element(header)}"
                + "@bottom-center{content:'第 ' counter(page) ' 页，共 ' counter(pages) ' 页'}}"
                + "body{margin:0;padding:0;font-size:10pt}.header{position:running(header)}"
                + ".edge{height:1mm;background:#000;font-size:0;line-height:0}"
                + "h1{font-size:15pt;font-weight:normal;margin:4mm 0}p{margin:3mm 0}"
                + "table{border-collapse:collapse;width:100%;table-layout:fixed;-fs-table-paginate:paginate}"
                + "thead{display:table-header-group}tr{page-break-inside:avoid}"
                + "td,th{height:8mm;box-sizing:border-box;border:0.3mm solid #666;padding:1mm 2mm;font-weight:normal;font-size:9pt}"
                + "th{background:#e8edf3}.amount{text-align:right}"
                + "</style></head><body><div class='header'>云流业务单据·版式验收</div>"
                + "<div class='edge'></div><h1>中文长表自然分页核定</h1>"
                + "<p>纸张 A4；边距：上20、下18、左17、右19毫米。</p>"
                + "<table><thead><tr><th style='width:20mm'>明细编号</th><th>项目说明</th><th style='width:29mm'>金额（元）</th></tr></thead><tbody>");
        for (int number = 1; number <= ROWS; number++) {
            html.append(String.format(Locale.ROOT, "<tr><td>R%03d</td><td>办公用品采购明细，第%d项中文说明</td><td class='amount'>%,.2f</td></tr>", number, number, number * 12.5));
        }
        return html.append("</tbody></table><p>验收样本结束：明细完整，金额含两位小数。</p></body></html>").toString();
    }

    private static int firstDark(BufferedImage image, int y, boolean fromLeft) {
        int step = fromLeft ? 1 : -1;
        for (int x = fromLeft ? 0 : image.getWidth() - 1; x >= 0 && x < image.getWidth(); x += step) {
            if (dark(image.getRGB(x, y))) return x;
        }
        return -1;
    }
    private static boolean dark(int rgb) { return (rgb & 255) < 40 && ((rgb >> 8) & 255) < 40 && ((rgb >> 16) & 255) < 40; }
    private static float points(double mm) { return (float) (mm * 72 / 25.4); }
    private static int pixels(double mm) { return (int) Math.round(mm * DPI / 25.4); }
    private static boolean close(float value, double mm) { return Math.abs(value - points(mm)) < 0.5; }
    private static void expect(boolean passed, String label) { if (!passed) failures.add(label); checks++; }

    private static final class Line {
        private final String text;
        private final float x;
        private final float right;
        private final float y;
        private Line(String text, float x, float right, float y) { this.text = text; this.x = x; this.right = right; this.y = y; }
    }

    private static final class Positions extends PDFTextStripper {
        private final List<Line> lines = new ArrayList<>();
        private Positions() throws IOException { setSortByPosition(true); }
        @Override protected void writeString(String text, List<TextPosition> positions) throws IOException {
            if (!positions.isEmpty()) {
                float left = Float.MAX_VALUE;
                float right = 0;
                float y = 0;
                for (TextPosition position : positions) {
                    left = Math.min(left, position.getXDirAdj());
                    right = Math.max(right, position.getXDirAdj() + position.getWidthDirAdj());
                    y = Math.max(y, position.getYDirAdj());
                }
                lines.add(new Line(text, left, right, y));
            }
            super.writeString(text, positions);
        }
    }
}
