package com.cloudflow.auth.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.auth.domain.SysFile;
import com.cloudflow.auth.mapper.SysFileMapper;
import com.cloudflow.auth.storage.FileStorageRegistry;
import com.cloudflow.auth.storage.FileStorageService;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.excel.importing.ImportFileStore;
import com.cloudflow.common.excel.importing.ImportIdentity;
import com.cloudflow.common.excel.importing.ImportSpreadsheets;
import com.cloudflow.common.excel.importing.PathMultipartFile;
import com.cloudflow.common.excel.importing.mapper.ImportTaskMapper;
import com.cloudflow.common.excel.importing.model.ImportTask;
import com.cloudflow.common.tenant.TenantContext;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;

@Service
@Primary
@Slf4j
@RequiredArgsConstructor
@ConditionalOnProperty(name = "cloudflow.import.enabled", havingValue = "true")
public class LocalImportFileStore implements ImportFileStore {
    private static final Pattern REFERENCE = Pattern.compile("^/api/auth/system/file/([1-9][0-9]*)/content$");
    private final ImportTaskMapper tasks;
    private final ImportIdentity identity;
    private final SysFileMapper fileMapper;
    private final ISysFileService fileService;
    private final FileStorageRegistry storage;
    private final SysFileConfigService configurations;
    private final ISysTenantService tenants;
    private final PlatformTransactionManager transactionManager;

    @Value("${cloudflow.import.delete-original-after-import:}")
    private Set<String> deleteOriginalAfterImport = Set.of();

    @Override
    @Transactional(rollbackFor = Exception.class)
    public String save(long taskId, Path source, String fileName, boolean errorFile, Long jobLogId) {
        try { return persist(taskId, new PathMultipartFile(source, fileName), errorFile, jobLogId); }
        catch (IOException exception) { throw new ServiceException("导入临时文件读取失败"); }
    }

    @Transactional(rollbackFor = Exception.class)
    public String saveUploaded(long taskId, MultipartFile file, boolean errorFile, Long jobLogId) {
        return persist(taskId, file, errorFile, jobLogId);
    }

    private String persist(long taskId, MultipartFile upload, boolean errorFile, Long jobLogId) {
        ImportTask task = owned(taskId, true, "system:import:execute");
        if (upload == null || upload.isEmpty()) throw new ServiceException("请选择导入文件");
        if (errorFile) {
            requireRun(task, jobLogId);
            String extension = task.getFileName().endsWith(".xlsx") ? ".xlsx" : ".txt";
            if (upload.getOriginalFilename() == null || !upload.getOriginalFilename().endsWith(extension)) throw new ServiceException("错误文件格式不匹配");
        } else if (!"UPLOADED".equals(task.getStatus()) || !"PENDING".equals(task.getFileUrl())
                || upload.getSize() != task.getFileSize() || upload.getSize() > ImportSpreadsheets.MAX_FILE_SIZE
                || !Objects.equals(upload.getOriginalFilename(), task.getFileName())) {
            throw new ServiceException("原文件与导入任务不匹配，或已保存");
        }
        configurations.lockTenant(task.getTenantId());
        if (errorFile && task.getErrorFileUrl() != null) discardReference(task, task.getErrorFileUrl());
        SysFile file = fileService.uploadFile(upload);
        int bound = fileMapper.update(null, new LambdaUpdateWrapper<SysFile>().eq(SysFile::getTenantId, task.getTenantId())
                .eq(SysFile::getFileId, file.getFileId()).eq(SysFile::getDeleted, 0).isNull(SysFile::getBizType)
                .set(SysFile::getBizType, "IMPORT_TASK").set(SysFile::getBizId, String.valueOf(taskId)));
        if (bound != 1) throw new ServiceException("导入文件绑定失败");
        String reference = "/api/auth/system/file/" + file.getFileId() + "/content";
        if (tasks.setFile(task.getTenantId(), task.getOperatorId(), taskId, reference, errorFile) != 1) throw new ServiceException("导入任务文件引用保存失败");
        return reference;
    }

    @Override
    public void copy(long taskId, boolean errorFile, OutputStream target) throws IOException {
        ImportTask task = owned(taskId, false, "system:import:list");
        SysFile file = boundFile(task, errorFile ? task.getErrorFileUrl() : task.getFileUrl());
        try (InputStream input = storage.getForFile(file).open(file.getFilePath())) {
            input.transferTo(target);
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "清理导入错误文件", highRisk = true)
    public void clearError(long taskId, Long jobLogId) {
        ImportTask task = owned(taskId, true, "system:import:execute");
        requireRun(task, jobLogId);
        if (task.getErrorFileUrl() == null) return;
        configurations.lockTenant(task.getTenantId());
        discardReference(task, task.getErrorFileUrl());
        tasks.setFile(task.getTenantId(), task.getOperatorId(), taskId, null, true);
        tenants.refreshTenantStorageSummary(task.getTenantId());
    }

    private ImportTask owned(long taskId, boolean lock, String permission) {
        ImportIdentity.Operator operator = identity.require(permission);
        ImportTask task = lock ? tasks.ownedForUpdate(operator.tenantId(), operator.userId(), taskId)
                : tasks.owned(operator.tenantId(), operator.userId(), taskId);
        if (task == null) throw new ServiceException("导入任务不存在或无权访问", 403);
        return task;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "按保留策略清理导入原文件", highRisk = true)
    public void clearCompletedOriginal(long taskId, Long jobLogId) {
        ImportTask task = owned(taskId, true, "system:import:execute");
        if (jobLogId == null || !Objects.equals(task.getJobLogId(), jobLogId)
                || !Set.of("SUCCESS", "PARTIAL").contains(task.getStatus())
                || task.processedRows() != task.getTotalRows()) {
            throw new ServiceException("仅可清理本次已完成导入的原文件");
        }
        if (!deleteOriginalAfterImport.contains(task.getBizType()) || REMOVED_REFERENCE.equals(task.getFileUrl())) return;
        removeCompletedOriginal(task);
    }

    private void removeCompletedOriginal(ImportTask task) {
        configurations.lockTenant(task.getTenantId());
        discardFile(task, boundFile(task, task.getFileUrl()), true);
        if (tasks.setFile(task.getTenantId(), task.getOperatorId(), task.getTaskId(), REMOVED_REFERENCE, false) != 1) {
            throw new ServiceException("导入原文件清理状态已改变");
        }
        tenants.refreshTenantStorageSummary(task.getTenantId());
    }

    /** Retry policy cleanup under the scheduler's explicit tenant context. */
    public int cleanupCompletedOriginals() {
        Long tenantId = TenantContext.getTenantId();
        if (tenantId == null) throw new ServiceException("清理导入原文件需要明确租户上下文");
        if (deleteOriginalAfterImport.isEmpty()) return 0;
        List<String> types = List.copyOf(deleteOriginalAfterImport);
        long afterId = 0;
        int cleaned = 0;
        List<ImportTask> batch;
        do {
            batch = tasks.completedOriginals(tenantId, types, afterId);
            for (ImportTask task : batch) {
                afterId = task.getTaskId();
                try {
                    Boolean removed = new TransactionTemplate(transactionManager).execute(status -> {
                        ImportTask current = tasks.ownedForUpdate(tenantId, task.getOperatorId(), task.getTaskId());
                        if (current == null || !deleteOriginalAfterImport.contains(current.getBizType())
                                || !Set.of("SUCCESS", "PARTIAL").contains(current.getStatus())
                                || current.processedRows() != current.getTotalRows()
                                || current.getFileUrl() == null || Set.of("PENDING", REMOVED_REFERENCE).contains(current.getFileUrl())) return false;
                        removeCompletedOriginal(current);
                        return true;
                    });
                    if (Boolean.TRUE.equals(removed)) cleaned++;
                } catch (RuntimeException exception) {
                    log.warn("导入原文件策略清理失败，留待下次任务重试 tenantId={} taskId={} errorType={}",
                            tenantId, task.getTaskId(), exception.getClass().getName());
                }
            }
        } while (batch.size() == 100);
        return cleaned;
    }

    private void requireRun(ImportTask task, Long jobLogId) {
        if (!Set.of("VALIDATING", "IMPORTING").contains(task.getStatus()) || !Objects.equals(task.getJobLogId(), jobLogId)) {
            throw new ServiceException("导入任务已结束或由新的执行接管");
        }
    }

    private SysFile boundFile(ImportTask task, String reference) {
        if (reference == null) throw new ServiceException("导入文件不存在", 404);
        Matcher match = REFERENCE.matcher(reference);
        if (!match.matches()) throw new ServiceException("导入文件引用无效", 404);
        Long fileId;
        try { fileId = Long.valueOf(match.group(1)); }
        catch (NumberFormatException exception) { throw new ServiceException("导入文件引用无效", 404); }
        SysFile file = fileMapper.selectOne(new LambdaQueryWrapper<SysFile>().eq(SysFile::getTenantId, task.getTenantId())
                .eq(SysFile::getFileId, fileId).eq(SysFile::getDeleted, 0).eq(SysFile::getBizType, "IMPORT_TASK")
                .eq(SysFile::getBizId, String.valueOf(task.getTaskId())));
        if (file == null) throw new ServiceException("导入文件不存在或无权访问", 403);
        return file;
    }

    private void discardReference(ImportTask task, String reference) {
        discardFile(task, boundFile(task, reference));
    }

    @Audit(name = "清理到期导入任务", highRisk = true)
    public int cleanupExpired(LocalDateTime cutoff) {
        Long tenantId = TenantContext.getTenantId();
        if (tenantId == null) throw new ServiceException("清理导入任务需要明确租户上下文");
        int cleaned = 0;
        List<ImportTask> batch;
        do {
            batch = tasks.expired(tenantId, cutoff);
            for (ImportTask task : batch) {
                Boolean removed = new TransactionTemplate(transactionManager).execute(status -> {
                    ImportTask current = tasks.ownedForUpdate(tenantId, task.getOperatorId(), task.getTaskId());
                    if (current == null || !current.getCreateTime().isBefore(cutoff) || Set.of("IMPORTING", "VALIDATING").contains(current.getStatus())) return false;
                    configurations.lockTenant(tenantId);
                    List<SysFile> bound = fileMapper.selectList(new LambdaQueryWrapper<SysFile>()
                            .eq(SysFile::getTenantId, tenantId).eq(SysFile::getDeleted, 0).eq(SysFile::getBizType, "IMPORT_TASK")
                            .eq(SysFile::getBizId, String.valueOf(task.getTaskId())).orderByAsc(SysFile::getFileId));
                    bound.forEach(file -> discardFile(current, file));
                    tasks.clearErrors(tenantId, current.getOperatorId(), current.getTaskId());
                    if (tasks.discardTask(tenantId, current.getOperatorId(), current.getTaskId()) != 1) throw new ServiceException("导入任务清理状态已改变");
                    tenants.refreshTenantStorageSummary(tenantId);
                    return true;
                });
                if (Boolean.TRUE.equals(removed)) cleaned++;
            }
        } while (batch.size() == 100);
        return cleaned;
    }

    private void discardFile(ImportTask task, SysFile file) {
        discardFile(task, file, false);
    }

    private void discardFile(ImportTask task, SysFile file, boolean deleteImmediately) {
        FileStorageService backend = storage.getForFile(file);
        if (fileMapper.deleteById(file.getFileId()) != 1) throw new ServiceException("导入文件清理失败");
        int remaining = Math.toIntExact(fileMapper.countReferences(file));
        fileMapper.updateReferenceCount(file, remaining);
        if (remaining == 0) {
            if (deleteImmediately) {
                // Completed imports no longer read this input; a failed delete rolls back the reference for retry.
                backend.delete(file.getFilePath());
                return;
            }
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCommit() {
                    try { backend.delete(file.getFilePath()); }
                    catch (RuntimeException exception) { log.error("导入文件物理清理失败，tenantId={}, fileId={}", task.getTenantId(), file.getFileId()); }
                }
            });
        }
    }
}
