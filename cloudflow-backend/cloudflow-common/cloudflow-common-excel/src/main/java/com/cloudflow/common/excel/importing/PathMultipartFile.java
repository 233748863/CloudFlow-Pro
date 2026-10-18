package com.cloudflow.common.excel.importing;

import com.cloudflow.common.core.utils.file.MimeTypeUtils;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Locale;
import org.springframework.web.multipart.MultipartFile;

public class PathMultipartFile implements MultipartFile {
    private final Path source;
    private final String name;
    private final long size;

    public PathMultipartFile(Path source, String name) throws IOException {
        this.source = source;
        this.name = name;
        this.size = Files.size(source);
    }

    @Override public String getName() { return "file"; }
    @Override public String getOriginalFilename() { return name; }
    @Override
    public String getContentType() {
        String extension = name.substring(name.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT);
        return switch (extension) {
            case "xlsx" -> MimeTypeUtils.APPLICATION_XLSX;
            case "xls" -> MimeTypeUtils.APPLICATION_MSEXCEL;
            case "csv" -> MimeTypeUtils.TEXT_CSV;
            case "txt" -> MimeTypeUtils.TEXT_PLAIN;
            default -> MimeTypeUtils.APPLICATION_OCTET_STREAM;
        };
    }
    @Override public boolean isEmpty() { return size == 0; }
    @Override public long getSize() { return size; }
    @Override public byte[] getBytes() throws IOException { return Files.readAllBytes(source); }
    @Override public InputStream getInputStream() throws IOException { return Files.newInputStream(source); }
    @Override public void transferTo(File destination) throws IOException { Files.copy(source, destination.toPath(), StandardCopyOption.REPLACE_EXISTING); }
}
