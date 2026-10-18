package com.cloudflow.oa.service.impl;

import cn.dev33.satoken.stp.StpLogic;
import cn.dev33.satoken.stp.StpUtil;
import com.cloudflow.auth.config.properties.AuthOssProperties;
import com.cloudflow.auth.config.properties.FileStorageProperties;
import com.cloudflow.auth.config.properties.FileUploadProperties;
import com.cloudflow.auth.domain.SysFile;
import com.cloudflow.auth.mapper.SysFileConfigMapper;
import com.cloudflow.auth.mapper.SysFileMapper;
import com.cloudflow.auth.mapper.SysTenantMapper;
import com.cloudflow.auth.mapper.SysUserMapper;
import com.cloudflow.auth.service.SysFileConfigService;
import com.cloudflow.auth.service.impl.SysFileServiceImpl;
import com.cloudflow.auth.service.impl.SysTenantServiceImpl;
import com.cloudflow.auth.storage.FileStorageRegistry;
import com.cloudflow.auth.storage.FileStorageSecretCipher;
import com.cloudflow.auth.storage.impl.LocalFileStorageService;
import com.cloudflow.common.config.CloudFlowConfig;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.oa.domain.MeetingRoom;
import com.cloudflow.oa.domain.dto.MeetingCommands;
import com.cloudflow.oa.mapper.MeetingRoomMapper;
import com.cloudflow.oa.mapper.OaMeetingMapper;
import com.cloudflow.oa.service.remote.RemoteMeetingRoomFileService;
import feign.FeignException;
import feign.Request;
import jakarta.servlet.ServletOutputStream;
import jakarta.servlet.WriteListener;
import jakarta.servlet.http.HttpServletResponse;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.InputStream;
import java.lang.reflect.Field;
import java.lang.reflect.Proxy;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Random;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.stream.Stream;
import javax.imageio.ImageIO;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.cloud.client.circuitbreaker.NoFallbackAvailableException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;

final class OaMeetingPhotoFixture implements AutoCloseable {
    private final JdbcTemplate jdbc;
    private final PlatformTransactionManager transactions;
    private final SysFileMapper fileMapper;
    private final SysFileServiceImpl files;
    private final OaMeetingRoomPhotoService photos;
    private final OaMeetingRoomRuleService rules;
    private final MeetingRoomServiceImpl rooms;
    private final long tenant;
    private final long host;
    private final long guest;
    private final Path root;
    private final Path target;
    private final String priorProfile = CloudFlowConfig.getProfile();
    private final AtomicInteger remoteCalls = new AtomicInteger();
    private final AtomicReference<RuntimeException> transportFailure = new AtomicReference<>();
    private int assertions;

    OaMeetingPhotoFixture(SqlSessionTemplate sessions, JdbcTemplate jdbc, PlatformTransactionManager transactions,
            MeetingRoomServiceImpl rooms, OaMeetingRoomRuleService rules, long tenant, long host, long guest) throws Exception {
        this.jdbc = jdbc; this.transactions = transactions; this.rooms = rooms; this.rules = rules;
        this.tenant = tenant; this.host = host; this.guest = guest;
        Path database = Path.of(Objects.requireNonNull(jdbc.queryForObject("SELECT @@datadir", String.class))).toAbsolutePath().normalize();
        target = database.getParent().getParent().toRealPath();
        if (!database.getParent().getFileName().toString().startsWith("batch-f-mysql-") || !target.getFileName().toString().equals("target")) {
            throw new IllegalArgumentException("Photos require the owned isolated database");
        }
        root = Files.createDirectory(target.resolve("h4-photos-" + UUID.randomUUID()));
        new CloudFlowConfig().setProfile(root.toString());
        fileMapper = sessions.getMapper(SysFileMapper.class);
        SysFileConfigService configurations = new SysFileConfigService(sessions.getMapper(SysFileConfigMapper.class), fileMapper, new FileStorageSecretCipher(UUID.randomUUID().toString()));
        SysTenantServiceImpl tenants = new SysTenantServiceImpl(); field(tenants, "baseMapper", sessions.getMapper(SysTenantMapper.class));
        field(tenants, "sysUserMapper", sessions.getMapper(SysUserMapper.class)); field(tenants, "sysFileMapper", fileMapper);
        FileStorageRegistry registry = new FileStorageRegistry(List.of(new LocalFileStorageService()), new FileStorageProperties(), configurations);
        files = transactional(new SysFileServiceImpl(fileMapper, registry, new FileUploadProperties(), new AuthOssProperties(), configurations,
                new com.cloudflow.common.tenant.quota.TenantQuotaService(sessions.getMapper(com.cloudflow.common.tenant.quota.mapper.TenantQuotaMapper.class)), null));
        RemoteMeetingRoomFileService remote = new RemoteMeetingRoomFileService() {
            @Override public R<Map<String, Object>> upload(Long roomId, MultipartFile file) {
                if (TransactionSynchronizationManager.isActualTransactionActive()) throw new AssertionError("照片远程调用不得持有OA事务");
                if (transportFailure.get() != null) throw transportFailure.get();
                remoteCalls.incrementAndGet(); SysFile stored = files.uploadMeetingRoomPhoto(file, roomId);
                return R.ok(Map.of("fileId", stored.getFileId().toString(), "fileName", stored.getFileName(), "size", stored.getFileSize(), "extension", stored.getFileType()));
            }
            @Override public feign.Response content(Long roomId, Long fileId) {
                if (TransactionSynchronizationManager.isActualTransactionActive()) throw new AssertionError("照片读取不得持有OA事务");
                if (transportFailure.get() != null) throw transportFailure.get();
                remoteCalls.incrementAndGet(); Capture capture = new Capture(); files.copyMeetingRoomPhoto(roomId, fileId, capture.response);
                return feign.Response.builder().status(200).reason("OK")
                        .request(feign.Request.create(feign.Request.HttpMethod.GET, "http://isolated.invalid/photo", Map.of(), null, java.nio.charset.StandardCharsets.UTF_8, null))
                        .headers(Map.of("Content-Type", List.of(capture.type))).body(capture.bytes.toByteArray()).build();
            }
        };
        photos = transactional(new OaMeetingRoomPhotoService(sessions.getMapper(MeetingRoomMapper.class), sessions.getMapper(OaMeetingMapper.class), remote));
    }

    int exercise() throws Exception {
        StpLogic prior = StpUtil.getStpLogic();
        StpUtil.setStpLogic(new StpLogic("meeting-photo-check") {
            @Override public boolean hasPermission(String permission) { return "oa:meeting:room-manage".equals(permission) && Objects.equals(UserContext.getUserId(), host); }
        });
        Long originalLimit = jdbc.queryForObject("SELECT storage_limit FROM sys_tenant WHERE tenant_id=?", Long.class, tenant);
        jdbc.update("UPDATE sys_tenant SET storage_limit=0 WHERE tenant_id=?", tenant);
        try {
            MeetingRoom room = room("H4中央存储照片"); MeetingRoom other = room("H4照片归属另一房间"); Long roomId = room.getRoomId();
            byte[] png = picture("png", 11, 8); MultipartFile upload = file("会议室.png", "image/png", png);
            Map<String, Object> uploaded = photos.upload(room.getRoomId(), upload);
            equal(Set.of("fileId", "fileName", "size", "extension"), uploaded.keySet(), "照片响应不泄漏磁盘路径、存储桶或内部下载地址");
            Long fileId = Long.valueOf(uploaded.get("fileId").toString()); SysFile stored = fileMapper.selectById(fileId);
            equal("OA_MEETING_ROOM", stored.getBizType(), "照片保存到G3中央文件表的固定业务类型");
            equal(room.getRoomId().toString(), stored.getBizId(), "照片绑定服务器核实的会议室ID");
            equal("PRIVATE", stored.getAccessType(), "照片固定为私有文件");
            equal(tenant, stored.getTenantId(), "照片租户来自可信身份");
            Capture direct = new Capture(); files.copyMeetingRoomPhoto(room.getRoomId(), fileId, direct.response);
            check(Arrays.equals(png, direct.bytes.toByteArray()), "中央存储实际写入和读取的PNG字节完全一致");
            equal("image/png", direct.type, "照片响应类型由已校验扩展名决定");
            equal("private, no-store", direct.headers.get("Cache-Control"), "照片响应禁止共享缓存");
            equal("nosniff", direct.headers.get("X-Content-Type-Options"), "照片响应禁止内容类型嗅探");
            rejects(() -> photos.content(roomId, new Capture().response), "上传但未绑定的照片不能从房间入口读取");
            MeetingCommands.Rule rule = rule(room, fileId); room = rules.save(room.getRoomId(), rule);
            Capture throughOa = new Capture(); photos.content(room.getRoomId(), throughOa.response);
            check(Arrays.equals(png, throughOa.bytes.toByteArray()), "OA代理真实中央存储内容，不返回占位照片");
            MeetingRoom bound = room;
            rejects(() -> rules.save(other.getRoomId(), rule(other, fileId)), "同租户也不能绑定其他房间照片");
            rejects(() -> files.copyMeetingRoomPhoto(other.getRoomId(), fileId, new Capture().response), "中央读取再次核对房间归属");
            rejects(() -> files.accessFileById(fileId, new Capture().response), "通用文件ID入口不能绕过照片业务鉴权");
            rejects(() -> files.accessFile(stored.getFilePath(), new Capture().response), "通用路径入口不能绕过照片业务鉴权");
            rejects(() -> files.deleteFileByIds(new Long[]{fileId}), "通用文件删除不能删除房间照片");
            int calls = remoteCalls.get(); identity(tenant, guest);
            try { rejects(() -> photos.upload(bound.getRoomId(), upload), "普通员工不能上传会议室照片"); }
            finally { identity(tenant, host); }
            equal(calls, remoteCalls.get(), "无维护权限在访问存储前拒绝");
            rejects(() -> photos.upload(Long.MAX_VALUE, upload), "不存在的房间不能登记照片");
            equal(calls, remoteCalls.get(), "不存在房间也不触发存储写入");
            identity(tenant + 1, host);
            try {
                rejects(() -> photos.upload(bound.getRoomId(), upload), "跨租户不能上传其他租户房间照片");
                rejects(() -> photos.content(bound.getRoomId(), new Capture().response), "跨租户不能读取房间照片");
                rejects(() -> files.copyMeetingRoomPhoto(bound.getRoomId(), fileId, new Capture().response), "中央存储独立拦截跨租户读取");
                MeetingRoom foreign = room("H4跨租户照片");
                rejects(() -> rules.save(foreign.getRoomId(), rule(foreign, fileId)), "跨租户照片ID不能绑定本租户房间");
                SysFile foreignPhoto = files.uploadMeetingRoomPhoto(upload, foreign.getRoomId());
                check(!stored.getFilePath().equals(foreignPhoto.getFilePath()), "相同字节在不同租户独立存储，不跨租户去重");
            } finally { identity(tenant, host); }
            rejects(() -> photos.upload(bound.getRoomId(), file("伪图片.png", "image/png", "<script>alert(1)</script>".getBytes(java.nio.charset.StandardCharsets.UTF_8))), "伪造PNG扩展名及类型不能上传HTML");
            rejects(() -> photos.upload(bound.getRoomId(), file("图片.svg", "image/svg+xml", png)), "PNG内容改成SVG扩展名仍拒绝");
            rejects(() -> photos.upload(bound.getRoomId(), file("空图片.png", "image/png", new byte[0])), "空照片拒绝");
            SysFile duplicate = files.uploadMeetingRoomPhoto(upload, bound.getRoomId());
            equal(stored.getFilePath(), duplicate.getFilePath(), "同租户同内容照片复用物理存储");
            equal(2, fileMapper.selectById(fileId).getRefCount(), "复用后真实引用数为2");
            rollback(bound.getRoomId(), png, fileId);
            long rowsBefore = number("SELECT COUNT(*) FROM sys_file WHERE tenant_id=?", tenant); long physicalBefore = physicalFiles();
            jdbc.update("UPDATE sys_tenant SET storage_limit=1 WHERE tenant_id=?", tenant);
            byte[] large = picture("png", 29, 800);
            check(large.length > 1024 * 1024, "配额测试使用真实超过1MiB的PNG字节");
            rejects(() -> files.uploadMeetingRoomPhoto(file("超过配额.png", "image/png", large), bound.getRoomId()), "中央存储真实配额不足时拒绝照片");
            equal(rowsBefore, number("SELECT COUNT(*) FROM sys_file WHERE tenant_id=?", tenant), "配额失败不写文件记录");
            equal(physicalBefore, physicalFiles(), "配额失败不残留物理文件");
            jdbc.update("UPDATE sys_tenant SET storage_limit=0 WHERE tenant_id=?", tenant);
            byte[] jpeg = picture("jpg", 37, 8); Map<String, Object> replacement = photos.upload(bound.getRoomId(), file("新版.jpg", "image/jpeg", jpeg));
            MeetingRoom replaced = rules.save(bound.getRoomId(), rule(bound, Long.valueOf(replacement.get("fileId").toString())));
            Capture latest = new Capture(); photos.content(replaced.getRoomId(), latest.response);
            check(Arrays.equals(jpeg, latest.bytes.toByteArray()) && "image/jpeg".equals(latest.type), "房间入口始终读取当前已绑定的真实JPEG照片");
            transportFailures(replaced.getRoomId(), upload);
            System.out.println("MEETING_H4_PHOTO_DATABASE: assertions=" + assertions + "; real_mysql=true; real_central_storage=true; real_quota=true; http=false; feign_and_servlet=fixtures; production_modified=false");
            return assertions;
        } finally { jdbc.update("UPDATE sys_tenant SET storage_limit=? WHERE tenant_id=?", originalLimit, tenant); identity(tenant, host); StpUtil.setStpLogic(prior); }
    }

    private void transportFailures(Long roomId, MultipartFile upload) {
        Request request = feign.Request.create(feign.Request.HttpMethod.POST, "http://isolated.invalid/photo", Map.of(), null, java.nio.charset.StandardCharsets.UTF_8, null);
        FeignException invalid = feign.FeignException.errorStatus("photo", feign.Response.builder().status(400).reason("private-transport-diagnostic").request(request).headers(Map.of()).build());
        FeignException unavailable = feign.FeignException.errorStatus("photo", feign.Response.builder().status(503).reason("private-transport-diagnostic").request(request).headers(Map.of()).build());
        List<RuntimeException> failures = List.of(invalid, new NoFallbackAvailableException("private-transport-diagnostic", invalid),
                new NoFallbackAvailableException("private-transport-diagnostic", new java.util.concurrent.ExecutionException(invalid)),
                new NoFallbackAvailableException("private-transport-diagnostic", new java.util.concurrent.TimeoutException()), unavailable);
        for (int index = 0; index < failures.size(); index++) {
            transportFailure.set(failures.get(index));
            try {
                failureCode(() -> photos.upload(roomId, upload), index < 3 ? 400 : 503, "照片上传传输异常分类" + index);
                failureCode(() -> photos.content(roomId, new Capture().response), 503, "照片读取传输异常分类" + index);
            } finally { transportFailure.set(null); }
        }
        String capacity = "{\"code\":409,\"msg\":\"租户可用存储空间不足，无法新增文件\",\"data\":null}";
        List<String> bodies = List.of(capacity, "{\"code\":409,\"msg\":\"租户存储用量刷新失败\"}",
                "private-transport-diagnostic", capacity.replace("409", "200"), capacity + " {}",
                capacity.replace("无法新增文件", "无法新增文件 private-transport-diagnostic"));
        for (String body : bodies) {
            FeignException conflict = feign.FeignException.errorStatus("photo", feign.Response.builder().status(409).request(request)
                    .headers(Map.of()).body(body, java.nio.charset.StandardCharsets.UTF_8).build());
            for (RuntimeException failure : List.of(conflict, new NoFallbackAvailableException("private-transport-diagnostic", conflict),
                    new NoFallbackAvailableException("private-transport-diagnostic", new java.util.concurrent.ExecutionException(conflict)))) {
                transportFailure.set(failure);
                try {
                    failureCode(() -> photos.upload(roomId, upload), body.equals(capacity) ? 409 : 503, "照片上游409仅识别明确容量不足");
                    failureCode(() -> photos.content(roomId, new Capture().response), 503, "照片读取失败不解释为上传额度不足");
                } finally { transportFailure.set(null); }
            }
        }
    }

    private void failureCode(Runnable action, int code, String label) {
        try { action.run(); }
        catch (ServiceException failure) {
            equal(code, failure.getCode(), label);
            check(!failure.getMessage().contains("private-transport-diagnostic"), label + "不泄漏内部异常详情");
            return;
        }
        throw new AssertionError(label);
    }

    private void rollback(Long roomId, byte[] existing, Long fileId) throws Exception {
        long before = physicalFiles(); long rows = number("SELECT COUNT(*) FROM sys_file WHERE tenant_id=?", tenant);
        byte[] different = picture("png", 73, 8);
        new TransactionTemplate(transactions).executeWithoutResult(status -> {
            files.uploadMeetingRoomPhoto(file("回滚.png", "image/png", different), roomId); status.setRollbackOnly();
        });
        equal(before, physicalFiles(), "数据库事务回滚同步清理新写照片字节");
        equal(rows, number("SELECT COUNT(*) FROM sys_file WHERE tenant_id=?", tenant), "照片事务回滚不残留文件行");
        new TransactionTemplate(transactions).executeWithoutResult(status -> {
            files.uploadMeetingRoomPhoto(file("复用回滚.png", "image/png", existing), roomId); status.setRollbackOnly();
        });
        equal(2, fileMapper.selectById(fileId).getRefCount(), "复用后回滚恢复引用数");
        Capture retained = new Capture(); files.copyMeetingRoomPhoto(roomId, fileId, retained.response);
        check(Arrays.equals(existing, retained.bytes.toByteArray()), "复用回滚不删除仍被引用的物理照片");
    }

    private MeetingRoom room(String name) {
        MeetingRoom input = new MeetingRoom(); input.setName(name); input.setCapacity(10); input.setStatus("1"); rooms.createRoom(input);
        Long id = jdbc.queryForObject("SELECT room_id FROM oa_meeting_room WHERE tenant_id=? AND name=?", Long.class, UserContext.getTenantId(), name);
        return rooms.getById(id);
    }
    private MeetingCommands.Rule rule(MeetingRoom room, Long fileId) {
        MeetingCommands.Rule command = new MeetingCommands.Rule(); command.setVersion(room.getVersion()); command.setPhotoFileId(fileId);
        command.setHolidayBookableFlag(1); command.setMinBookingMinutes(1); command.setNeedApprovalFlag(0); command.setBufferMinutes(0); return command;
    }
    private byte[] picture(String format, long seed, int size) throws Exception {
        BufferedImage pixels = new BufferedImage(size, size, BufferedImage.TYPE_INT_RGB); Random random = new java.util.Random(seed);
        for (int row = 0; row < size; row++) for (int column = 0; column < size; column++) pixels.setRGB(column, row, random.nextInt(0x1000000));
        ByteArrayOutputStream buffer = new ByteArrayOutputStream(); if (!ImageIO.write(pixels, format, buffer)) throw new IllegalStateException("Image writer unavailable"); return buffer.toByteArray();
    }
    private MultipartFile file(String name, String type, byte[] bytes) {
        return new MultipartFile() {
            @Override public String getName() { return "file"; }
            @Override public String getOriginalFilename() { return name; }
            @Override public String getContentType() { return type; }
            @Override public boolean isEmpty() { return bytes.length == 0; }
            @Override public long getSize() { return bytes.length; }
            @Override public byte[] getBytes() { return bytes.clone(); }
            @Override public InputStream getInputStream() { return new ByteArrayInputStream(bytes); }
            @Override public void transferTo(File destination) throws java.io.IOException { Files.write(destination.toPath(), bytes); }
        };
    }
    private static final class Capture {
        final ByteArrayOutputStream bytes = new ByteArrayOutputStream(); final Map<String, String> headers = new HashMap<>(); String type;
        final HttpServletResponse response = (HttpServletResponse) Proxy.newProxyInstance(HttpServletResponse.class.getClassLoader(), new Class<?>[]{HttpServletResponse.class}, (proxy, method, arguments) -> {
            if (method.getName().equals("setContentType")) { type = (String) arguments[0]; return null; }
            if (method.getName().equals("setHeader")) { headers.put((String) arguments[0], (String) arguments[1]); return null; }
            if (method.getName().equals("getOutputStream")) return new ServletOutputStream() {
                @Override public boolean isReady() { return true; }
                @Override public void setWriteListener(WriteListener listener) { }
                @Override public void write(int value) { bytes.write(value); }
            };
            throw new UnsupportedOperationException("Unexpected servlet operation " + method.getName());
        });
    }
    @SuppressWarnings("unchecked") private <Value> Value transactional(Value service) {
        ProxyFactory factory = new ProxyFactory(service); factory.setProxyTargetClass(true);
        factory.addAdvice(new TransactionInterceptor(transactions, new AnnotationTransactionAttributeSource())); return (Value) factory.getProxy();
    }
    private void field(Object targetObject, String name, Object value) throws Exception {
        for (Class<?> type = targetObject.getClass(); type != null; type = type.getSuperclass()) {
            try { Field field = type.getDeclaredField(name); field.setAccessible(true); field.set(targetObject, value); return; }
            catch (NoSuchFieldException ignored) { }
        }
        throw new NoSuchFieldException(name);
    }
    private long physicalFiles() throws Exception { try (Stream<Path> files = Files.walk(root)) { return files.filter(Files::isRegularFile).count(); } }
    private long number(String sql, Object... values) { return Objects.requireNonNull(jdbc.queryForObject(sql, Long.class, values)); }
    private void identity(long tenantId, long userId) { TenantContext.setTenantId(tenantId); UserContext.setTenantId(tenantId); UserContext.setUserId(userId); UserContext.setUserName("meeting-check-" + userId); UserContext.setDsType(4); }
    private void equal(Object expected, Object actual, String label) { check(Objects.equals(expected, actual), label + " expected=" + expected + " actual=" + actual); }
    private void rejects(Runnable work, String label) { try { work.run(); } catch (ServiceException | IllegalArgumentException failure) { check(true, label + " actual=" + failure.getMessage()); return; } throw new AssertionError(label); }
    private void check(boolean success, String label) { if (!success) throw new AssertionError(label); assertions++; System.out.println("PASS " + label); }
    @Override public void close() throws Exception {
        new CloudFlowConfig().setProfile(priorProfile);
        if (!root.toRealPath().startsWith(target) || !root.getFileName().toString().startsWith("h4-photos-")) throw new IllegalStateException("Unsafe photo cleanup path");
        try (Stream<Path> paths = Files.walk(root)) { for (Path path : paths.sorted(Comparator.reverseOrder()).toList()) Files.delete(path); }
        System.out.println("MEETING_H4_PHOTO_CLEANUP: owned_directory_removed=true");
    }
}
