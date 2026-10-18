package com.cloudflow.common.excel.importing;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.file.Path;

public interface ImportFileStore {
    String REMOVED_REFERENCE = "REMOVED";

    String save(long taskId, Path source, String fileName, boolean errorFile, Long jobLogId);
    void copy(long taskId, boolean errorFile, OutputStream target) throws IOException;
    void clearError(long taskId, Long jobLogId);

    /** Optional retention policy; existing stores keep the original by default. */
    default void clearCompletedOriginal(long taskId, Long jobLogId) { }
}
