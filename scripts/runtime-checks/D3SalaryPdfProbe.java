import java.awt.image.BufferedImage;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.io.InputStream;
import java.util.Map;
import javax.imageio.ImageIO;
import com.cloudflow.hr.service.HrPdfRenderer;
import org.apache.fontbox.ttf.TTFParser;
import org.apache.fontbox.ttf.TrueTypeFont;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.apache.pdfbox.text.PDFTextStripper;

/** Parses and renders the actual owned salary download; never prints document contents. */
public class D3SalaryPdfProbe {
    public static void main(String[] args) throws Exception {
        if (args.length != 3) throw new IllegalArgumentException("PDF, text and image paths required");
        Path pdf = Path.of(args[0]).toRealPath();
        Path evidence = Path.of("D:/CloudFlowPro/.cloudflow-runtime/full-prd-20260915/approved-runtime").toRealPath();
        if (!pdf.startsWith(evidence)) throw new IllegalArgumentException("Owned evidence required");
        Path text = Path.of(args[1]).toAbsolutePath().normalize();
        Path image = Path.of(args[2]).toAbsolutePath().normalize();
        if (!text.getParent().equals(pdf.getParent()) || !image.getParent().equals(pdf.getParent())) {
            throw new IllegalArgumentException("Same evidence directory required");
        }
        if (Files.exists(text) || Files.exists(image)) throw new IllegalArgumentException("Retain original evidence");
        try (InputStream stream = HrPdfRenderer.class.getResourceAsStream("/fonts/NotoSansSC-Regular.ttf")) {
            if (stream == null) throw new IllegalStateException("Packaged Chinese font missing");
            try (TrueTypeFont font = new TTFParser().parse(stream)) {
                if (font.getOS2Windows().getWeightClass() != 400) throw new IllegalStateException("Regular weight required");
                if (!font.getName().contains("NotoSansSC")) throw new IllegalStateException("Expected approved Noto font");
            }
        }
        try (PDDocument document = PDDocument.load(pdf.toFile())) {
            String contents = new PDFTextStripper().getText(document);
            Files.writeString(text, contents, StandardCharsets.UTF_8);
            BufferedImage rendered = new PDFRenderer(document).renderImageWithDPI(0, 120);
            if (!ImageIO.write(rendered, "png", image.toFile())) throw new IllegalStateException("PNG writer missing");
            System.out.println("D3_PDF_PARSED: pages=" + document.getNumberOfPages() + "; characters=" + contents.length());
        }
        HrPdfRenderer renderer = new HrPdfRenderer();
        checkTemplate(renderer, pdf.getParent(), "certificate", renderer.defaultCertificateTemplate(),
                Map.of("title", "在职证明", "employeeName", "中文测试员工", "body", "薪资证明测试"),
                new String[]{"在职证明", "中文测试员工", "薪资证明测试", "特此证明"});
        checkTemplate(renderer, pdf.getParent(), "training", renderer.defaultTrainingCertificateTemplate(),
                Map.of("employeeName", "中文测试员工", "courseName", "安全培训"),
                new String[]{"培训证书", "中文测试员工", "安全培训", "考核结果合格"});
        System.out.println("D3_PDF_SHARED_TEMPLATES: certificate=true; training=true; packaged_regular_font=true");
    }

    private static void checkTemplate(HrPdfRenderer renderer, Path directory, String name, String template,
                                      Map<String, Object> values, String[] expected) throws Exception {
        Path output = directory.resolve(name + ".pdf");
        if (Files.exists(output)) throw new IllegalStateException("Retain template evidence");
        byte[] bytes = renderer.render(renderer.fillTemplate(template, values));
        Files.write(output, bytes);
        try (PDDocument document = PDDocument.load(bytes)) {
            String contents = new PDFTextStripper().getText(document);
            for (String value : expected) {
                if (!contents.contains(value)) throw new IllegalStateException("Shared template Chinese text missing: " + name);
            }
        }
    }
}
