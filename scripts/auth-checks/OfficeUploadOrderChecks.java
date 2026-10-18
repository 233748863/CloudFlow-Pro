package com.cloudflow.auth.upload;

import com.cloudflow.common.core.utils.file.FileUploadUtils;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import org.apache.poi.xssf.streaming.SXSSFWorkbook;
import org.springframework.web.multipart.MultipartFile;

/** Regression checks for Office ZIP entries whose content manifest comes last. */
public final class OfficeUploadOrderChecks {
    private static int passed;

    public static void main(String[] args) throws Exception {
        accepted("xlsx", List.of("docProps/app.xml", "xl/worksheets/sheet1.xml", "[Content_Types].xml"));
        accepted("xlsx", List.of("[Content_Types].xml", "xl/workbook.xml"));
        accepted("docx", List.of("word/document.xml", "[Content_Types].xml"));
        accepted("pptx", List.of("ppt/presentation.xml", "[Content_Types].xml"));
        rejected("xlsx", List.of("xl/workbook.xml"));
        rejected("xlsx", List.of("[Content_Types].xml", "readme.txt"));
        rejected("xlsx", List.of("[Content_Types].xml", "word/document.xml"));
        rejected("xlsx", List.of("readme.txt"));
        streamingWorkbook();
        if (args.length == 1) {
            byte[] bytes = Files.readAllBytes(Path.of(args[0]));
            FileUploadUtils.validate(new MemoryFile("real-openpyxl.xlsx", bytes), 10485760L, new String[] {"xlsx"});
            passed++;
        }
        System.out.println("OFFICE_UPLOAD_ORDER_PASS=" + passed);
    }

    private static void streamingWorkbook() throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        SXSSFWorkbook workbook = new SXSSFWorkbook(100);
        try {
            workbook.createSheet("导入数据").createRow(0).createCell(0).setCellValue("错误说明");
            workbook.write(output);
        } finally {
            workbook.close();
            workbook.dispose();
        }
        FileUploadUtils.validate(new MemoryFile("errors.xlsx", output.toByteArray()), 10485760L, new String[] {"xlsx"});
        passed++;
    }

    private static void accepted(String extension, List<String> entries) throws Exception {
        FileUploadUtils.validate(new MemoryFile("valid." + extension, zip(entries)), 10485760L, new String[] {extension});
        passed++;
    }

    private static void rejected(String extension, List<String> entries) throws IOException {
        try {
            FileUploadUtils.validate(new MemoryFile("invalid." + extension, zip(entries)), 10485760L, new String[] {extension});
        } catch (Exception expected) {
            passed++;
            return;
        }
        throw new AssertionError("Invalid Office content accepted: " + entries);
    }

    private static byte[] zip(List<String> entries) throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ZipOutputStream output = new ZipOutputStream(bytes)) {
            for (String entry : entries) {
                output.putNextEntry(new ZipEntry(entry));
                output.write("<xml/>".getBytes(StandardCharsets.UTF_8));
                output.closeEntry();
            }
        }
        return bytes.toByteArray();
    }

    private record MemoryFile(String filename, byte[] content) implements MultipartFile {
        @Override public String getName() { return "file"; }
        @Override public String getOriginalFilename() { return filename; }
        @Override public String getContentType() { return "application/octet-stream"; }
        @Override public boolean isEmpty() { return content.length == 0; }
        @Override public long getSize() { return content.length; }
        @Override public byte[] getBytes() { return content.clone(); }
        @Override public InputStream getInputStream() { return new java.io.ByteArrayInputStream(content); }
        @Override public void transferTo(File destination) throws IOException { Files.write(destination.toPath(), content); }
    }
}
