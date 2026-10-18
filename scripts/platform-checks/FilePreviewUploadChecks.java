import com.cloudflow.common.core.utils.file.FileUploadUtils;
import com.cloudflow.common.core.utils.file.MimeTypeUtils;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Arrays;
import java.util.Base64;
import java.util.List;
import org.springframework.web.multipart.MultipartFile;

public class FilePreviewUploadChecks {
    private static int assertions;
    private static final String LOSSY = "UklGRjAAAABXRUJQVlA4ICQAAABQAQCdASoCAAIAAUAmJQBOgCgAAP72E13Sfqf6Lw7c2RaQAAA=";
    private static final String EXTENDED = "UklGRlAAAABXRUJQVlA4WAoAAAAQAAAAAQAAAQAAQUxQSAUAAAAAgICAgABWUDggJAAAAFABAJ0BKgIAAgABQCYlAE6AKAAA/vW4fdJ+p/ovDtzZFpAAAA==";

    public static void main(String[] arguments) throws Exception {
        check(Arrays.asList(MimeTypeUtils.DEFAULT_ALLOWED_EXTENSION).contains("webp"), "default upload allows WebP");
        check(Arrays.asList(MimeTypeUtils.IMAGE_EXTENSION).contains("webp"), "image upload allows WebP");
        check("webp".equals(MimeTypeUtils.getExtension("Image/WebP; charset=binary")), "normalized MIME fallback");
        for (String source : List.of(LOSSY, EXTENDED)) {
            byte[] bytes = Base64.getDecoder().decode(source);
            for (String mime : List.of("image/webp", "application/octet-stream", "")) {
                FileUploadUtils.ValidatedFile result = validate("photo.WEBP", mime, bytes);
                check("webp".equals(result.extension()) && "image/webp".equals(result.contentType()), "real WebP bytes and MIME");
            }
            check("webp".equals(validate("photo", "image/webp", bytes).extension()), "extension inferred from verified MIME");
            rejected(() -> validate("photo.webp", "image/png", bytes), "mismatched declared type");
            rejected(() -> validate("photo.png", "image/png", bytes), "WebP cannot masquerade as PNG");
            rejected(() -> FileUploadUtils.validate(new UploadFile("photo.webp", "image/webp", bytes), bytes.length, new String[]{"png"}), "explicit administrator restriction remains effective");
            rejected(() -> FileUploadUtils.validate(new UploadFile("photo.webp", "image/webp", bytes), bytes.length - 1, MimeTypeUtils.DEFAULT_ALLOWED_EXTENSION), "size limit remains effective");
            for (int length : List.of(4, 12, 16, 20, 24, bytes.length - 1)) {
                rejected(() -> validate("photo.webp", "image/webp", Arrays.copyOf(bytes, length)), "truncated WebP");
            }
            byte[] wrongSize = bytes.clone();
            ByteBuffer.wrap(wrongSize).order(ByteOrder.LITTLE_ENDIAN).putInt(4, bytes.length);
            rejected(() -> validate("photo.webp", "image/webp", wrongSize), "RIFF size must match actual upload");
            byte[] overflowingChunk = bytes.clone();
            ByteBuffer.wrap(overflowingChunk).order(ByteOrder.LITTLE_ENDIAN).putInt(16, -1);
            rejected(() -> validate("photo.webp", "image/webp", overflowingChunk), "unsigned chunk overflow rejected");
            byte[] wrongContainer = bytes.clone();
            System.arraycopy("WAVE".getBytes(StandardCharsets.US_ASCII), 0, wrongContainer, 8, 4);
            rejected(() -> validate("photo.webp", "image/webp", wrongContainer), "RIFF audio cannot masquerade as WebP");
            byte[] wrongCodec = bytes.clone();
            System.arraycopy("VP9 ".getBytes(StandardCharsets.US_ASCII), 0, wrongCodec, 12, 4);
            rejected(() -> validate("photo.webp", "image/webp", wrongCodec), "unknown codec rejected");
            byte[] wrongFrame = bytes.clone();
            wrongFrame[23] = 1;
            rejected(() -> validate("photo.webp", "image/webp", wrongFrame), "invalid frame signature or reserved header rejected");
        }
        for (String disguised : List.of("<svg onload='alert(1)'/>", "<!DOCTYPE html><script>alert(1)</script>", "%PDF-1.7\nbody", "RIFF0000WEBPVP8 ")) {
            rejected(() -> validate("photo.webp", "image/webp", disguised.getBytes(StandardCharsets.US_ASCII)), "unsafe disguised content");
        }
        check(MimeTypeUtils.requiresDetectedContentType("webp"), "WebP requires actual content detection");
        check(!MimeTypeUtils.isAllowedDetectedContentType("webp", "image/png"), "detected image type cannot be substituted");
        System.out.println("FILE_PREVIEW_UPLOAD_CHECKS: assertions=" + assertions + "; failed=0; webp_variants=2; administrator_restrictions_preserved=true; http=false; production_modified=false");
    }

    private static FileUploadUtils.ValidatedFile validate(String name, String mime, byte[] bytes) throws Exception {
        return FileUploadUtils.validate(new UploadFile(name, mime, bytes), FileUploadUtils.DEFAULT_MAX_SIZE, MimeTypeUtils.DEFAULT_ALLOWED_EXTENSION);
    }

    private static void check(boolean condition, String label) {
        assertions++;
        if (!condition) throw new AssertionError(label);
    }

    private static void rejected(CheckedAction action, String label) throws Exception {
        try { action.run(); }
        catch (Exception expected) { assertions++; return; }
        throw new AssertionError(label);
    }

    private interface CheckedAction { void run() throws Exception; }

    private record UploadFile(String name, String contentType, byte[] content) implements MultipartFile {
        @Override public String getName() { return "file"; }
        @Override public String getOriginalFilename() { return name; }
        @Override public String getContentType() { return contentType; }
        @Override public boolean isEmpty() { return content.length == 0; }
        @Override public long getSize() { return content.length; }
        @Override public byte[] getBytes() { return content.clone(); }
        @Override public InputStream getInputStream() { return new ByteArrayInputStream(content); }
        @Override public void transferTo(File destination) throws IOException { Files.write(destination.toPath(), content); }
    }
}
