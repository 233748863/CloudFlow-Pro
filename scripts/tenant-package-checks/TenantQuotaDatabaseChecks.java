package com.cloudflow.auth.tenantpackage;

import com.cloudflow.auth.config.properties.AuthOssProperties;
import com.cloudflow.auth.config.properties.FileStorageProperties;
import com.cloudflow.auth.config.properties.FileUploadProperties;
import com.cloudflow.auth.domain.SysFile;
import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.auth.mapper.SysFileConfigMapper;
import com.cloudflow.auth.mapper.SysFileMapper;
import com.cloudflow.auth.mapper.SysRoleMapper;
import com.cloudflow.auth.mapper.SysUserMapper;
import com.cloudflow.auth.mapper.SysUserRoleMapper;
import com.cloudflow.auth.mapper.TenantPackageMapper;
import com.cloudflow.auth.service.PasswordPolicyService;
import com.cloudflow.auth.service.PasswordService;
import com.cloudflow.auth.service.RoleMutexService;
import com.cloudflow.auth.service.SysFileConfigService;
import com.cloudflow.auth.service.impl.SysFileServiceImpl;
import com.cloudflow.auth.service.impl.SysUserServiceImpl;
import com.cloudflow.auth.storage.FileStorageRegistry;
import com.cloudflow.auth.storage.FileStorageSecretCipher;
import com.cloudflow.auth.storage.impl.LocalFileStorageService;
import com.cloudflow.common.config.CloudFlowConfig;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.tenant.TenantConfigProperties;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.common.tenant.quota.TenantQuotaService;
import com.cloudflow.common.tenant.quota.mapper.TenantQuotaMapper;
import com.cloudflow.crm.mapper.CrmEmailPrivateFileMapper;
import com.cloudflow.crm.service.email.archive.CrmEmailArchiveAccess;
import com.cloudflow.crm.service.email.archive.CrmEmailArchiveFiles;
import com.cloudflow.hr.mapper.HrFileStorageMapper;
import com.cloudflow.hr.service.HrFileStorage;
import com.cloudflow.oa.mapper.OaPrivateFileMapper;
import com.cloudflow.oa.service.impl.OaPrivateFileStorageService;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.lang.reflect.Field;
import java.lang.reflect.Proxy;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Stream;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;

final class TenantQuotaDatabaseChecks {
    private static final long TENANT = 780001;
    private static final long OTHER = 780002;
    private static final long MB = 1024L * 1024L;
    private final JdbcTemplate jdbc;
    private final SqlSessionTemplate sessions;
    private final PlatformTransactionManager transactions;
    private final TenantQuotaService quotas;
    private final TenantPackageStore packages;
    private final Path directory;
    private int assertions;

    TenantQuotaDatabaseChecks(JdbcTemplate jdbc, SqlSessionTemplate sessions, PlatformTransactionManager transactions, Path root) throws Exception {
        this.jdbc = jdbc;
        this.sessions = sessions;
        this.transactions = transactions;
        this.quotas = new TenantQuotaService(sessions.getMapper(TenantQuotaMapper.class));
        this.packages = new TenantPackageStore(sessions.getMapper(TenantPackageMapper.class), transactions);
        directory = Files.createDirectory(root.resolve(".cloudflow-runtime").resolve("tenant-quota-" + UUID.randomUUID()));
    }

    void verify() throws Exception {
        String profile = CloudFlowConfig.getProfile();
        Long previousTenant = TenantContext.getTenantId();
        try {
            identity(TENANT);
            new CloudFlowConfig().setProfile(directory.resolve("auth").toString());
            seed(TENANT); seed(OTHER);
            boundaries();
            physicalAccounting();
            verifyUsers();
            verifyFiles();
            staleSnapshots();
            System.out.println("TENANT_QUOTA_DATABASE_CHECKS: assertions=" + assertions
                    + "; failed=0; real_mysql=true; isolation=REPEATABLE_READ; tenant_plugin=true; production_user_service=true; production_file_services=AUTH,HR,OA,CRM; physical_files=true; role_policy_double=true; http=false");
        } finally {
            new CloudFlowConfig().setProfile(profile);
            UserContext.clear(); TenantContext.clear();
            if (previousTenant != null) TenantContext.setTenantId(previousTenant);
            try (Stream<Path> paths = Files.walk(directory)) {
                for (Path path : paths.sorted(Comparator.reverseOrder()).toList()) Files.delete(path);
            }
        }
    }

    private void seed(long tenantId) {
        jdbc.update("INSERT INTO sys_tenant (tenant_id, tenant_code, tenant_name, user_limit, storage_limit, status, deleted) VALUES (?, ?, ?, 1, 1, '0', 0)",
                tenantId, "quota-" + tenantId, "Quota " + tenantId);
    }

    private void boundaries() {
        rejects(IllegalStateException.class, () -> quotas.requireUserCapacity(TENANT));
        rejects(IllegalStateException.class, () -> quotas.requireStorageCapacity(TENANT, 1));
        rejects(ServiceException.class, () -> write(() -> quotas.requireStorageCapacity(TENANT, -1)));
        rejects(ServiceException.class, () -> write(() -> quotas.requireUserCapacity(null)));
        rejects(ServiceException.class, () -> write(() -> quotas.requireUserCapacity(780099L)));
        rejects(ServiceException.class, () -> write(() -> quotas.requireUserCapacity(OTHER)));
        TransactionTemplate readOnly = transaction(); readOnly.setReadOnly(true);
        rejects(IllegalStateException.class, () -> readOnly.executeWithoutResult(status -> quotas.requireUserCapacity(TENANT)));
        jdbc.update("UPDATE sys_tenant SET deleted=1 WHERE tenant_id=?", TENANT);
        rejects(ServiceException.class, () -> write(() -> quotas.requireStorageCapacity(TENANT, 0)));
        jdbc.update("UPDATE sys_tenant SET deleted=0 WHERE tenant_id=?", TENANT);
        write(() -> quotas.requireStorageCapacity(TENANT, MB)); assertions++;
        rejects(ServiceException.class, () -> write(() -> quotas.requireStorageCapacity(TENANT, MB + 1)));
    }

    private void physicalAccounting() {
        transaction().executeWithoutResult(status -> {
            jdbc.update("INSERT INTO sys_file (tenant_id,file_path,storage_type,config_id,file_size,deleted) VALUES (?, '/quota/Blob', 'LOCAL', NULL, 100, 0), (?, '/quota/Blob', 'LOCAL', NULL, 110, 0), (?, '/quota/Blob', 'LOCAL', 10, 200, 0), (?, '/quota/Blob', 'OSS', NULL, 300, 0), (?, '/quota/blob', 'LOCAL', NULL, 400, 0), (?, '', 'LOCAL', NULL, 1000, 0), (?, NULL, 'LOCAL', NULL, 2000, 0), (?, '/quota/deleted', 'LOCAL', NULL, 9999, 1), (?, '/quota/other', 'LOCAL', NULL, 9000, 0)",
                    TENANT, TENANT, TENANT, TENANT, TENANT, TENANT, TENANT, TENANT, OTHER);
            TenantQuotaMapper mapper = sessions.getMapper(TenantQuotaMapper.class);
            mapper.lockTenant(TENANT);
            equal(4010L, mapper.storageBytes(TENANT).longValueExact(), "physical grouping preserves config, storage type, case, absent paths and tenant boundaries");
            Integer version = jdbc.queryForObject("SELECT version FROM sys_tenant WHERE tenant_id=?", Integer.class, TENANT);
            quotas.refreshStorage(TENANT);
            equal(1L, usedMb(), "physical bytes round upward to MB");
            equal(version, jdbc.queryForObject("SELECT version FROM sys_tenant WHERE tenant_id=?", Integer.class, TENANT), "usage refresh does not overwrite permission version");
            equal(1L, jdbc.queryForObject("SELECT storage_limit FROM sys_tenant WHERE tenant_id=?", Long.class, TENANT), "usage refresh does not replace quota");
            status.setRollbackOnly();
        });
        equal(0L, files(), "accounting fixtures rolled back");
    }

    private SysUserServiceImpl userService(boolean failRoleWrite) throws Exception {
        SysUserServiceImpl users = new SysUserServiceImpl();
        field(users, "sysUserMapper", sessions.getMapper(SysUserMapper.class));
        field(users, "sysRoleMapper", sessions.getMapper(SysRoleMapper.class));
        field(users, "tenantQuotas", quotas);
        field(users, "passwordPolicyService", new PasswordPolicyService());
        field(users, "passwordService", new PasswordService(null, null, new TenantConfigProperties()));
        field(users, "roleMutexService", new RoleMutexService(null, null) {
            @Override public void assertNoConflict(Long[] roles, Long tenantId) { }
        });
        SysUserRoleMapper roles = sessions.getMapper(SysUserRoleMapper.class);
        if (failRoleWrite) roles = (SysUserRoleMapper) Proxy.newProxyInstance(SysUserRoleMapper.class.getClassLoader(),
                new Class<?>[] {SysUserRoleMapper.class}, (proxy, method, values) -> { throw new DeliberateFailure(); });
        field(users, "sysUserRoleMapper", roles);
        return transactional(users);
    }

    private void verifyUsers() throws Exception {
        SysUserServiceImpl users = userService(false);
        race(() -> users.insertUser(user()), () -> users.insertUser(user()), 1);
        equal(1L, users(), "only one concurrent user admitted");
        jdbc.update("UPDATE sys_user SET status='1' WHERE tenant_id=?", TENANT);
        rejects(ServiceException.class, () -> users.insertUser(user()));
        jdbc.update("UPDATE sys_user SET deleted=1 WHERE tenant_id=?", TENANT);
        equal(1, users.insertUser(user()), "deleted users do not consume capacity");
        jdbc.update("UPDATE sys_tenant SET user_limit=2 WHERE tenant_id=?", TENANT);
        SysUserServiceImpl failing = userService(true);
        SysUser request = user(); request.setRoleIds(new Long[] {5L});
        rejects(DeliberateFailure.class, () -> failing.insertUser(request));
        equal(1L, users(), "role failure rolls back inserted user");
        equal(1, users.insertUser(user()), "rolled back slot can be used");
        jdbc.update("UPDATE sys_tenant SET user_limit=1 WHERE tenant_id=?", TENANT);
        rejects(ServiceException.class, () -> users.insertUser(user()));
        equal(2L, users(), "quota reduction preserves existing users");
        for (Integer unlimited : Arrays.asList(null, 0)) {
            jdbc.update("UPDATE sys_tenant SET user_limit=? WHERE tenant_id=?", unlimited, TENANT);
            equal(1, users.insertUser(user()), "legacy unlimited user quota");
        }
    }

    private void verifyFiles() throws Exception {
        SysFileMapper mapper = sessions.getMapper(SysFileMapper.class);
        SysFileConfigService configurations = new SysFileConfigService(sessions.getMapper(SysFileConfigMapper.class), mapper,
                new FileStorageSecretCipher(UUID.randomUUID().toString()));
        FileStorageRegistry registry = new FileStorageRegistry(List.of(new LocalFileStorageService()), new FileStorageProperties(), configurations);
        SysFileServiceImpl auth = transactional(new SysFileServiceImpl(mapper, registry, new FileUploadProperties(), new AuthOssProperties(), configurations, quotas, null));
        HrFileStorage humanResources = new HrFileStorage(sessions.getMapper(HrFileStorageMapper.class), quotas);
        field(humanResources, "baseDir", directory.resolve("hr").toString());
        HrFileStorage hr = transactional(humanResources);
        OaPrivateFileStorageService office = new OaPrivateFileStorageService(sessions.getMapper(OaPrivateFileMapper.class), quotas);
        field(office, "baseDirectory", directory.resolve("oa").toString());
        OaPrivateFileStorageService oa = transactional(office);
        CrmEmailArchiveFiles archive = new CrmEmailArchiveFiles(sessions.getMapper(CrmEmailPrivateFileMapper.class), quotas);
        field(archive, "baseDirectory", directory.resolve("crm").toString());
        CrmEmailArchiveFiles crm = transactional(archive);
        Upload full = upload((int) MB, 1);
        race(() -> auth.uploadFile(full), () -> auth.uploadFile(full), 2);
        equal(2L, files(), "duplicate uploads create two references");
        equal(1L, jdbc.queryForObject("SELECT COUNT(DISTINCT file_path) FROM sys_file WHERE tenant_id=? AND deleted=0", Long.class, TENANT), "duplicate uploads share one physical object");
        equal(2, jdbc.queryForObject("SELECT MIN(ref_count) FROM sys_file WHERE tenant_id=? AND deleted=0", Integer.class, TENANT), "reference count sees committed upload");
        equal(1L, diskFiles(), "duplicate uploads write only one disk file");
        equal(1L, usedMb(), "full storage summary");
        rejects(ServiceException.class, () -> auth.uploadFile(upload(1_000, 2)));
        Long firstId = jdbc.queryForObject("SELECT MIN(file_id) FROM sys_file WHERE tenant_id=? AND deleted=0", Long.class, TENANT);
        auth.deleteFileByIds(new Long[] {firstId});
        equal(1L, diskFiles(), "deleting a reference keeps the physical object");
        Long secondId = jdbc.queryForObject("SELECT MIN(file_id) FROM sys_file WHERE tenant_id=? AND deleted=0", Long.class, TENANT);
        auth.deleteFileByIds(new Long[] {secondId});
        equal(0L, diskFiles(), "last reference deletion removes the physical object");
        equal(0L, usedMb(), "last reference frees storage");
        race(() -> hr.save(upload(700_000, 3).bytes(), "proof.pdf", "HR_LEAVE_PROOF"),
                () -> oa.upload(OaPrivateFileStorageService.Kind.CONTRACT_EVIDENCE, upload(700_000, 4)), 1);
        equal(1L, files(), "HR and OA uploads share the same quota lock");
        equal(1L, diskFiles(), "rejected concurrent upload writes no physical file");
        CrmEmailArchiveAccess.Business business = new CrmEmailArchiveAccess.Business("CUSTOMER", 100L, null, "Quota customer");
        rejects(ServiceException.class, () -> crm.upload(business, upload(700_000, 5)));
        rejects(ServiceException.class, () -> auth.uploadFile(upload(700_000, 6)));
        jdbc.update("UPDATE sys_tenant SET storage_limit=3 WHERE tenant_id=?", TENANT);
        rollbackFile(() -> auth.uploadFile(upload(2_000, 7)));
        rollbackFile(() -> hr.save(upload(2_000, 8).bytes(), "proof.pdf", "application/pdf"));
        rollbackFile(() -> oa.upload(OaPrivateFileStorageService.Kind.CONTRACT_SIGNED, upload(2_000, 9)));
        rollbackFile(() -> crm.upload(business, upload(2_000, 10)));
        SysFile retained = auth.uploadFile(upload(1_400_000, 11));
        jdbc.update("UPDATE sys_tenant SET storage_limit=1 WHERE tenant_id=?", TENANT);
        long existingFiles = files();
        rejects(ServiceException.class, () -> auth.uploadFile(upload(1_400_000, 11)));
        equal(existingFiles, files(), "over-limit duplicate upload is blocked without deleting existing files");
        try (InputStream content = registry.getForFile(retained).open(retained.getFilePath())) {
            equal(1_400_000, content.readAllBytes().length, "existing file remains readable after reduction");
        }
        equal(TENANT, retained.getTenantId(), "trusted tenant stored");
        for (Long unlimited : Arrays.asList(null, 0L)) {
            jdbc.update("UPDATE sys_tenant SET storage_limit=? WHERE tenant_id=?", unlimited, TENANT);
            crm.upload(business, upload(1_000, 12)); assertions++;
        }
        identity(OTHER);
        equal(1, userService(false).insertUser(user()), "other tenant user quota is independent");
        hr.save(upload(1_000, 13).bytes(), "proof.pdf", "application/pdf"); assertions++;
        identity(TENANT);
    }

    private void staleSnapshots() throws Exception {
        jdbc.update("UPDATE sys_tenant SET user_limit=100, storage_limit=100 WHERE tenant_id=?", TENANT);
        SysUserServiceImpl users = userService(false);
        afterChange(() -> packages.write(mapper -> {
            mapper.lockTenant(TENANT);
            jdbc.update("UPDATE sys_tenant SET user_limit=1, storage_limit=1 WHERE tenant_id=?", TENANT);
            return null;
        }), () -> {
            rejects(ServiceException.class, () -> users.insertUser(user()));
            rejects(ServiceException.class, () -> quotas.requireStorageCapacity(TENANT, 0));
        });
        identity(OTHER);
        jdbc.update("UPDATE sys_tenant SET storage_limit=1 WHERE tenant_id=?", OTHER);
        afterChange(() -> {
            identity(OTHER);
            packages.write(mapper -> {
                mapper.lockTenant(OTHER);
                jdbc.update("INSERT INTO sys_file (tenant_id,file_name,file_path,storage_type,file_size,deleted) VALUES (?, 'fixture', '/quota-fixture-one', 'LOCAL', ?, 0)", OTHER, MB);
                return null;
            });
        }, () -> rejects(ServiceException.class, () -> quotas.requireStorageCapacity(OTHER, 0)));
        jdbc.update("UPDATE sys_tenant SET storage_limit=? WHERE tenant_id=?", Long.MAX_VALUE / MB, OTHER);
        jdbc.update("INSERT INTO sys_file (tenant_id,file_name,file_path,storage_type,file_size,deleted) VALUES (?, 'fixture', '/quota-overflow-one', 'LOCAL', ?, 0), (?, 'fixture', '/quota-overflow-two', 'LOCAL', ?, 0)",
                OTHER, Long.MAX_VALUE, OTHER, Long.MAX_VALUE);
        rejects(ServiceException.class, () -> write(() -> quotas.requireStorageCapacity(OTHER, Long.MAX_VALUE)));
        write(() -> quotas.refreshStorage(OTHER));
        equal(17_592_186_044_418L, jdbc.queryForObject("SELECT storage_used FROM sys_tenant WHERE tenant_id=?", Long.class, OTHER), "storage aggregation and rounding do not overflow long bytes");
        identity(TENANT);
    }

    private void afterChange(Runnable change, Runnable action) throws Exception {
        ExecutorService worker = Executors.newSingleThreadExecutor();
        try {
            transaction().executeWithoutResult(status -> {
                jdbc.queryForObject("SELECT COUNT(*) FROM sys_file", Long.class);
                jdbc.queryForObject("SELECT COUNT(*) FROM sys_user", Long.class);
                jdbc.queryForObject("SELECT COUNT(*) FROM sys_tenant", Long.class);
                Future<?> changed = worker.submit(change);
                try { changed.get(15, TimeUnit.SECONDS); }
                catch (Exception failure) { throw new IllegalStateException(failure); }
                action.run();
                status.setRollbackOnly();
            });
        } finally { worker.shutdownNow(); if (!worker.awaitTermination(15, TimeUnit.SECONDS)) throw new AssertionError("change worker did not stop"); }
    }

    private void race(Runnable first, Runnable second, int accepted) throws Exception {
        CountDownLatch snapshots = new CountDownLatch(2);
        AtomicInteger successes = new AtomicInteger();
        AtomicInteger rejections = new AtomicInteger();
        ExecutorService workers = Executors.newFixedThreadPool(2);
        try {
            List<Future<?>> pending = Stream.of(first, second).<Future<?>>map(operation -> workers.submit(() -> {
                identity(TENANT);
                try {
                    write(() -> {
                        jdbc.queryForObject("SELECT COUNT(*) FROM sys_user", Long.class);
                        jdbc.queryForObject("SELECT COUNT(*) FROM sys_file", Long.class);
                        snapshots.countDown();
                        try { if (!snapshots.await(10, TimeUnit.SECONDS)) throw new AssertionError("snapshots did not overlap"); }
                        catch (InterruptedException failure) { Thread.currentThread().interrupt(); throw new IllegalStateException(failure); }
                        operation.run();
                    });
                    successes.incrementAndGet();
                } catch (ServiceException exceeded) {
                    if (!exceeded.getMessage().contains("上限") && !exceeded.getMessage().contains("存储空间不足")) throw exceeded;
                    rejections.incrementAndGet();
                } finally { UserContext.clear(); TenantContext.clear(); }
            })).toList();
            for (Future<?> result : pending) result.get(25, TimeUnit.SECONDS);
            equal(accepted, successes.get(), "concurrent successful admissions");
            equal(2 - accepted, rejections.get(), "concurrent quota rejections");
        } finally { workers.shutdownNow(); if (!workers.awaitTermination(15, TimeUnit.SECONDS)) throw new AssertionError("race workers did not stop"); }
    }

    private void rollbackFile(Runnable upload) throws Exception {
        long beforeRows = files(); long beforeDisk = diskFiles(); long beforeUsed = usedMb();
        rejects(DeliberateFailure.class, () -> write(() -> { upload.run(); throw new DeliberateFailure(); }));
        equal(beforeRows, files(), "failed business transaction rolls back file row");
        equal(beforeDisk, diskFiles(), "failed business transaction cleans physical file");
        equal(beforeUsed, usedMb(), "failed business transaction rolls back storage summary");
    }

    private long users() { return jdbc.queryForObject("SELECT COUNT(*) FROM sys_user WHERE tenant_id=? AND deleted=0", Long.class, TENANT); }
    private long files() { return jdbc.queryForObject("SELECT COUNT(*) FROM sys_file WHERE tenant_id=? AND deleted=0", Long.class, TENANT); }
    private long usedMb() { return jdbc.queryForObject("SELECT storage_used FROM sys_tenant WHERE tenant_id=?", Long.class, TENANT); }
    private long diskFiles() throws IOException { try (Stream<Path> paths = Files.walk(directory)) { return paths.filter(Files::isRegularFile).count(); } }
    private static void identity(long tenantId) {
        TenantContext.clear(); TenantContext.setTenantId(tenantId);
        UserContext.clear(); UserContext.setTenantId(tenantId); UserContext.setUserId(42L); UserContext.setUserName("quota-check");
    }
    private static SysUser user() {
        SysUser user = new SysUser(); user.setUserName("quota" + UUID.randomUUID().toString().replace("-", "").substring(0, 24));
        user.setNickName("quota-check"); user.setPassword("QuotaChecks123"); user.setStatus("0"); user.setDeleted(0);
        return user;
    }
    private static Upload upload(int size, int marker) {
        byte[] bytes = new byte[size]; Arrays.fill(bytes, (byte) marker);
        byte[] header = "%PDF-1.4\n".getBytes(StandardCharsets.US_ASCII); System.arraycopy(header, 0, bytes, 0, header.length);
        return new Upload(bytes);
    }
    private record Upload(byte[] bytes) implements MultipartFile {
        @Override public String getName() { return "file"; }
        @Override public String getOriginalFilename() { return "quota.pdf"; }
        @Override public String getContentType() { return "application/pdf"; }
        @Override public boolean isEmpty() { return bytes.length == 0; }
        @Override public long getSize() { return bytes.length; }
        @Override public byte[] getBytes() { return bytes.clone(); }
        @Override public InputStream getInputStream() { return new ByteArrayInputStream(bytes); }
        @Override public void transferTo(File destination) throws IOException { Files.write(destination.toPath(), bytes); }
    }
    private TransactionTemplate transaction() {
        TransactionTemplate template = new TransactionTemplate(transactions);
        template.setIsolationLevel(TransactionDefinition.ISOLATION_REPEATABLE_READ);
        return template;
    }
    private void write(Runnable action) { transaction().executeWithoutResult(status -> action.run()); }
    private <Target> Target transactional(Target target) {
        ProxyFactory factory = new ProxyFactory(target); factory.setProxyTargetClass(true);
        factory.addAdvice(new TransactionInterceptor(transactions, new AnnotationTransactionAttributeSource()));
        @SuppressWarnings("unchecked") Target result = (Target) factory.getProxy();
        return result;
    }
    private static void field(Object target, String name, Object value) throws Exception {
        Field field = target.getClass().getDeclaredField(name); field.setAccessible(true); field.set(target, value);
    }
    private void rejects(Class<? extends RuntimeException> expected, Runnable action) {
        try { action.run(); }
        catch (RuntimeException failure) { if (!expected.isInstance(failure)) throw failure; assertions++; return; }
        throw new AssertionError("Expected " + expected.getSimpleName());
    }
    private void equal(Object expected, Object actual, String description) {
        if (!Objects.equals(expected, actual)) throw new AssertionError(description + ": expected=" + expected + ", actual=" + actual);
        assertions++;
    }
    private static final class DeliberateFailure extends RuntimeException { }
}
