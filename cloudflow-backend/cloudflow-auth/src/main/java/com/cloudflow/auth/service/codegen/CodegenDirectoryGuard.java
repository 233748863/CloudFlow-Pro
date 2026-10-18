package com.cloudflow.auth.service.codegen;

import com.sun.jna.Memory;
import com.sun.jna.Library;
import com.sun.jna.Native;
import com.sun.jna.Platform;
import com.sun.jna.platform.win32.Kernel32;
import com.sun.jna.platform.win32.WinBase;
import com.sun.jna.platform.win32.WinDef;
import com.sun.jna.platform.win32.WinNT;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.SeekableByteChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** Uses pinned Windows handles or descriptor-relative Linux directories for generated output. */
public final class CodegenDirectoryGuard implements AutoCloseable {
    private final List<WinNT.HANDLE> handles = new ArrayList<>();
    private final Map<Path, Integer> descriptors = new LinkedHashMap<>();
    // Linux UAPI flags: O_PATH | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC.
    private static final int DIRECTORY_FLAGS = 0x200000 | 0x10000 | 0x20000 | 0x80000;

    public interface LinuxFiles extends Library {
        int open(String path, int flags);
        int openat(int directory, String path, int flags);
        int mkdirat(int directory, String path, int mode);
        int close(int descriptor);
    }

    private static final class Linux {
        private static final LinuxFiles FILES = Native.load(Platform.C_LIBRARY_NAME, LinuxFiles.class);
    }

    public CodegenDirectoryGuard(Path projectRoot) throws IOException {
        if (!Platform.isWindows() && !Platform.isLinux()) {
            throw new IOException("当前文件系统不支持安全目录写入");
        }
        try {
            Path cursor = projectRoot.getRoot();
            pin(cursor);
            for (Path segment : projectRoot) {
                cursor = cursor.resolve(segment);
                pin(cursor);
            }
        } catch (IOException | RuntimeException exception) {
            close();
            throw exception;
        }
    }

    public void createDirectories(Path projectRoot, Path directory) throws IOException {
        if (!directory.startsWith(projectRoot)) throw new IOException("写盘目录越过项目边界");
        Path cursor = projectRoot;
        for (Path segment : projectRoot.relativize(directory)) {
            if (segment.toString().isEmpty()) continue;
            if (Platform.isLinux()) {
                Integer parent = descriptors.get(cursor);
                if (parent == null) throw new IOException("写盘父目录未固定");
                int result = Linux.FILES.mkdirat(parent, segment.toString(), 0755);
                if (result != 0 && Native.getLastError() != 17) {
                    throw new IOException("无法创建写盘目录; errno=" + Native.getLastError());
                }
                cursor = cursor.resolve(segment);
                pin(cursor);
                continue;
            }
            cursor = cursor.resolve(segment);
            if (!Files.exists(cursor, LinkOption.NOFOLLOW_LINKS)) {
                try {
                    Files.createDirectory(cursor);
                } catch (java.nio.file.FileAlreadyExistsException concurrentCreation) {
                    // The following handle open validates a concurrent winner without following links.
                }
            }
            pin(cursor);
        }
    }

    private void pin(Path directory) throws IOException {
        if (Platform.isLinux()) {
            if (descriptors.containsKey(directory)) return;
            Integer parent = descriptors.get(directory.getParent());
            int descriptor = parent == null
                    ? Linux.FILES.open(directory.toString(), DIRECTORY_FLAGS)
                    : Linux.FILES.openat(parent, directory.getFileName().toString(), DIRECTORY_FLAGS);
            if (descriptor < 0) throw new IOException("无法固定写盘目录: " + directory + "; errno=" + Native.getLastError());
            descriptors.put(directory, descriptor);
            return;
        }
        WinNT.HANDLE handle = Kernel32.INSTANCE.CreateFile(directory.toString(), WinNT.GENERIC_READ,
                WinNT.FILE_SHARE_READ | WinNT.FILE_SHARE_WRITE, null, WinNT.OPEN_EXISTING,
                WinNT.FILE_FLAG_BACKUP_SEMANTICS | WinNT.FILE_FLAG_OPEN_REPARSE_POINT, null);
        if (WinBase.INVALID_HANDLE_VALUE.equals(handle)) {
            throw new IOException("无法固定写盘目录: " + directory + "; Win32=" + Native.getLastError());
        }
        handles.add(handle);
        try (Memory information = new Memory(8)) {
            // FILE_INFO_BY_HANDLE_CLASS.FileAttributeTagInfo = 9, two DWORD fields.
            if (!Kernel32.INSTANCE.GetFileInformationByHandleEx(handle, 9, information, new WinDef.DWORD(8))) {
                throw new IOException("无法读取写盘目录句柄: " + Native.getLastError());
            }
            int attributes = information.getInt(0);
            if ((attributes & WinNT.FILE_ATTRIBUTE_DIRECTORY) == 0
                    || (attributes & WinNT.FILE_ATTRIBUTE_REPARSE_POINT) != 0) {
                throw new IOException("写盘目录在检查后被替换: " + directory);
            }
        }
    }

    public Path filePath(Path target) throws IOException {
        if (!Platform.isLinux()) return target;
        Integer parent = descriptors.get(target.getParent());
        if (parent == null) throw new IOException("写盘父目录未固定");
        return Path.of("/proc/self/fd", parent.toString(), target.getFileName().toString());
    }

    public void writeFile(Path target, String source, boolean overwrite) throws IOException {
        Path fixedTarget = filePath(target);
        if (!overwrite) {
            writeNewFile(fixedTarget, source);
            return;
        }
        if (!Files.isRegularFile(fixedTarget, LinkOption.NOFOLLOW_LINKS)) {
            throw new IOException("禁止覆盖符号链接或非普通文件");
        }
        // Replace the directory entry, never truncate a possibly hard-linked inode.
        Path temporary = fixedTarget.resolveSibling(".codegen-" + UUID.randomUUID() + ".tmp");
        try {
            writeNewFile(temporary, source);
            Files.move(temporary, fixedTarget, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
        } finally {
            Files.deleteIfExists(temporary);
        }
    }

    private void writeNewFile(Path target, String source) throws IOException {
        Set<java.nio.file.OpenOption> options = new HashSet<>();
        options.add(StandardOpenOption.WRITE);
        options.add(StandardOpenOption.CREATE_NEW);
        options.add(LinkOption.NOFOLLOW_LINKS);
        if (Platform.isWindows()) {
            options.add(com.sun.nio.file.ExtendedOpenOption.NOSHARE_DELETE);
            options.add(com.sun.nio.file.ExtendedOpenOption.NOSHARE_WRITE);
        }
        try (SeekableByteChannel channel = Files.newByteChannel(target, options)) {
            ByteBuffer content = StandardCharsets.UTF_8.encode(source);
            while (content.hasRemaining()) channel.write(content);
        }
    }

    @Override
    public void close() {
        for (int index = handles.size() - 1; index >= 0; index--) {
            Kernel32.INSTANCE.CloseHandle(handles.get(index));
        }
        handles.clear();
        for (Integer descriptor : descriptors.values()) Linux.FILES.close(descriptor);
        descriptors.clear();
    }
}
