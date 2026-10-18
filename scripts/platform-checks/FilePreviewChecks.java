import com.cloudflow.common.core.file.FilePreviewContent;
import com.cloudflow.common.core.file.FilePreviewRange;
import com.cloudflow.common.core.file.FilePreviewReferences;
import com.cloudflow.common.core.file.FilePreviewRequest;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.List;
import java.util.Objects;

public class FilePreviewChecks {
    private static int assertions;

    public static void main(String[] arguments) {
        references();
        requests();
        content();
        ranges();
        System.out.println("FILE_PREVIEW_RULE_CHECKS: assertions=" + assertions
                + "; failed=0; content_types=5; max_bytes=" + FilePreviewContent.MAX_BYTES
                + "; http=false; mysql=false; redis=false; production_modified=false");
    }

    private static void references() {
        FilePreviewRequest contract = request("OA_CONTRACT", "123", null, "/upload/contracts/scan.pdf", "attachment", null, null);
        equal("/upload/contracts/scan.pdf", FilePreviewReferences.choose(contract, List.of("/upload/contracts/scan.pdf")), "stored path reference");
        FilePreviewRequest wrapped = request("OA_CONTRACT", "123", null, "/api/auth/system/file/access?path=%2Fupload%2Fcontracts%2Fscan.pdf", "attachment", null, null);
        equal("/upload/contracts/scan.pdf", FilePreviewReferences.choose(wrapped, List.of("/upload/contracts/scan.pdf")), "legacy authorized wrapper");
        for (String reference : List.of("/api/auth/system/file/45/content", "/auth/system/file/45/content", "oa-file:CONTRACT_EVIDENCE:45", "oa-file:CONTRACT_SIGNED:45")) {
            equal(45L, FilePreviewReferences.fileId(reference), "registered id reference");
        }
        equal(null, FilePreviewReferences.fileId("https://outside.invalid/45.pdf"), "external URL never becomes file id");
        equal(null, FilePreviewReferences.fileId("/api/auth/system/file/45/content?other=46"), "id references cannot smuggle query");
        rejected(() -> FilePreviewReferences.choose(contract, List.of("/upload/other.pdf")), "cross record reference");
        rejected(() -> FilePreviewReferences.normalize("/upload/\nfile.pdf"), "control character");
        rejected(() -> FilePreviewReferences.normalize(" "), "empty reference");
        rejected(() -> FilePreviewReferences.fileId("/api/auth/system/file/9999999999999999999/content"), "id overflow");
        rejected(() -> FilePreviewReferences.choose(request("OA_CONTRACT", "123", 46L, "/api/auth/system/file/45/content", "attachment", null, null), List.of("/api/auth/system/file/45/content")), "conflicting explicit id");
        equal(List.of("a", "b"), FilePreviewReferences.split("a,, b "), "persisted multiple attachment fields");
    }

    private static void requests() {
        for (String type : List.of("OA_LICENSE", "OA_INVOICE", "OA_KNOWLEDGE", "HR_RESUME", "OA_CONTRACT_SIGNED")) {
            FilePreviewRequest request = request(type, "123", 45L, null, null, null, null);
            equal(request, request.validated(), "business context " + type);
        }
        for (String type : List.of("OA_EXPENSE", "OA_CONTRACT_EVIDENCE", "OA_SUPPLIER_QUALIFICATION")) {
            equal(123L, request(type, "123", 45L, null, null, 67L, null).validated().businessId(), "child context " + type);
            rejected(() -> request(type, "123", 45L, null, null, null, null).validated(), "child required " + type);
        }
        equal("PUBLIC", request("PUBLIC", null, 45L, null, null, null, null).validated().bizType(), "public context");
        equal(2, request("OA_KNOWLEDGE", "123", 45L, null, null, null, 2).validated().versionNo(), "explicit knowledge version");
        for (String id : Arrays.asList(null, "", "0", "-1", "1.5", "01", "123 OR 1=1", "9223372036854775808")) {
            rejected(() -> request("OA_LICENSE", id, 45L, null, null, null, null).validated(), "invalid business identifier");
        }
        for (String type : Arrays.asList(null, "", "UNKNOWN", "PORTAL", "oa_license")) {
            rejected(() -> request(type, "123", 45L, null, null, null, null).validated(), "no default adapter");
        }
        rejected(() -> request("PUBLIC", "1", 45L, null, null, null, null).validated(), "public cannot carry business id");
        rejected(() -> request("OA_LICENSE", "1", 45L, null, null, 1L, null).validated(), "no ignored child context");
        rejected(() -> request("OA_CONTRACT", "1", 45L, null, null, null, null).validated(), "contract slot required");
        rejected(() -> request("OA_CONTRACT", "1", 45L, null, "signed", null, null).validated(), "signed file uses dedicated access policy");
        rejected(() -> request("OA_LICENSE", "1", 45L, null, null, null, 1).validated(), "version cannot bypass another adapter");
        rejected(() -> request("OA_LICENSE", "1", null, null, null, null, null).validated(), "file required");
        rejected(() -> request("OA_LICENSE", "1", -1L, null, null, null, null).validated(), "negative file");
        for (String field : List.of("proof", "items[0].proof", "items[999].proof", "items.proof")) {
            FilePreviewRequest workflow = new FilePreviewRequest("WORKFLOW_FORM", "instance-1", 45L, null, null, null, null, "definition-1", "instance-1", "task-1", field);
            equal(workflow, workflow.validated(), "workflow field path");
        }
        rejected(() -> new FilePreviewRequest("WORKFLOW_FORM", "instance-2", 45L, null, null, null, null, "definition-1", "instance-1", "task-1", "proof").validated(), "mismatched workflow business id");
        rejected(() -> new FilePreviewRequest("WORKFLOW_FORM", "instance-1", 45L, null, null, null, null, "definition-1", "instance-1", "task-1", "items[1000].proof").validated(), "workflow path bound");
    }

    private static void content() {
        equal(20971520, FilePreviewContent.MAX_BYTES, "20 MiB exact");
        equal("application/pdf", FilePreviewContent.mediaType("合同.PDF"), "case-insensitive suffix");
        for (String name : Arrays.asList(null, "file", "file.svg", "file.html", "file.xml", "file.docx", "file.pdf.exe", "bad\r\n.pdf")) {
            equal(null, FilePreviewContent.mediaType(name), "unsafe or unsupported suffix");
        }
        check(FilePreviewContent.matches("%PDF-1.7\nbody".getBytes(StandardCharsets.US_ASCII), "application/pdf"), "PDF 1.7");
        check(FilePreviewContent.matches("%PDF-2.0\nbody".getBytes(StandardCharsets.US_ASCII), "application/pdf"), "PDF 2.0");
        byte[] png = new byte[24];
        byte[] signature = new byte[]{(byte) 137, 80, 78, 71, 13, 10, 26, 10};
        System.arraycopy(signature, 0, png, 0, signature.length);
        System.arraycopy("IHDR".getBytes(StandardCharsets.US_ASCII), 0, png, 12, 4);
        check(FilePreviewContent.matches(png, "image/png"), "PNG signature and header");
        check(FilePreviewContent.matches(new byte[]{(byte) 255, (byte) 216, (byte) 255, (byte) 224}, "image/jpeg"), "JPEG signature");
        check(FilePreviewContent.matches("GIF89a1234567".getBytes(StandardCharsets.US_ASCII), "image/gif"), "GIF signature");
        check(FilePreviewContent.matches("RIFF0000WEBPVP8 ".getBytes(StandardCharsets.US_ASCII), "image/webp"), "WebP signature");
        for (String media : List.of("application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp")) {
            check(!FilePreviewContent.matches("<svg onload='alert(1)'/>".getBytes(StandardCharsets.US_ASCII), media), "SVG masquerade denied");
            check(!FilePreviewContent.matches("<!DOCTYPE html><script>alert(1)</script>".getBytes(StandardCharsets.US_ASCII), media), "HTML masquerade denied");
            check(!FilePreviewContent.matches(new byte[0], media), "zero content denied");
        }
        byte[] maximum = new byte[FilePreviewContent.MAX_BYTES];
        System.arraycopy("%PDF-1.7".getBytes(StandardCharsets.US_ASCII), 0, maximum, 0, 8);
        check(FilePreviewContent.matches(maximum, "application/pdf"), "exact size accepted");
        check(!FilePreviewContent.matches(Arrays.copyOf(maximum, maximum.length + 1), "application/pdf"), "over limit denied");
        equal("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", FilePreviewContent.digest("abc"), "SHA-256 known answer");
    }

    private static void ranges() {
        for (int size = 1; size <= 200; size++) {
            equal(new FilePreviewRange(0, size, false), FilePreviewRange.parse(null, size), "whole object");
            equal(new FilePreviewRange(0, size, true), FilePreviewRange.parse("bytes=0-", size), "open range");
            equal(new FilePreviewRange(0, size, true), FilePreviewRange.parse("bytes=-999999", size), "large suffix clamps");
            for (int start = 0; start < size; start += 7) {
                int remaining = size - start;
                equal(new FilePreviewRange(start, remaining, true), FilePreviewRange.parse("bytes=" + start + "-", size), "remaining object");
                equal(new FilePreviewRange(start, 1, true), FilePreviewRange.parse("bytes=" + start + "-" + start, size), "one byte range");
            }
        }
        for (String header : List.of("", "bytes=-", "bytes=1-0", "bytes=10-", "bytes=0-1,2-3", "bytes=+1-2", "bytes= -1", "bytes=-0", "BYTES=0-1", "bytes=0-9999999999999999999", "bytes=0-1\r\nX-Test: value")) {
            rejected(() -> FilePreviewRange.parse(header, 10), "invalid range");
        }
        equal("bytes 0-4/10", FilePreviewRange.parse("bytes=0-4", 10).contentRange(10), "Content-Range");
        equal(new FilePreviewRange(8, 2, true), FilePreviewRange.parse("bytes=-2", 10), "suffix range");
        equal(new FilePreviewRange(0, 10, true), FilePreviewRange.parse("bytes=0-100", 10), "end clamps to exact object");
    }

    private static FilePreviewRequest request(String type, String id, Long fileId, String reference, String slot, Long childId, Integer version) {
        return new FilePreviewRequest(type, id, fileId, reference, slot, childId, version, null, null, null, null);
    }

    private static void check(boolean condition, String label) { assertions++; if (!condition) throw new AssertionError(label); }
    private static void equal(Object expected, Object actual, String label) { check(Objects.equals(expected, actual), label); }
    private static void rejected(Runnable action, String label) {
        try { action.run(); }
        catch (RuntimeException expected) { check(true, label); return; }
        throw new AssertionError(label);
    }
}
