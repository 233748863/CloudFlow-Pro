package com.cloudflow.startup.checks;

import cn.dev33.satoken.annotation.SaCheckLogin;
import cn.dev33.satoken.annotation.SaCheckPermission;
import cn.dev33.satoken.annotation.SaCheckRole;
import cn.dev33.satoken.strategy.SaAnnotationStrategy;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.cloudflow.auth.domain.SysJob;
import com.cloudflow.auth.domain.SysJobHandler;
import com.cloudflow.auth.mapper.SysJobHandlerMapper;
import com.cloudflow.auth.mapper.SysJobMapper;
import com.cloudflow.auth.service.JobPlatformService;
import com.cloudflow.common.holiday.mapper.HolidayResolverMapper;
import com.cloudflow.common.holiday.service.HolidayCalendarServiceImpl;
import com.cloudflow.common.security.config.SecurityWebMvcConfig;
import com.cloudflow.common.security.interceptor.UserContextInterceptor;
import com.cloudflow.common.security.oauth2.OAuthRequestInterceptor;
import com.cloudflow.common.security.portal.PortalRequestInterceptor;
import com.cloudflow.common.tenant.TenantInterceptor;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import java.sql.SQLTransactionRollbackException;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Delayed;
import java.util.concurrent.FutureTask;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.springframework.context.annotation.AnnotatedBeanDefinitionReader;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.event.ContextRefreshedEvent;
import org.springframework.dao.CannotAcquireLockException;
import org.springframework.dao.DeadlockLoserDataAccessException;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.scheduling.Trigger;
import org.springframework.web.context.support.GenericWebApplicationContext;

public final class RequestStartupChecks {
    private static int checks;

    public static void main(String[] arguments) {
        MapperBuilderAssistant mappings = new MapperBuilderAssistant(new MybatisConfiguration(), "startup-checks");
        TableInfoHelper.initTableInfo(mappings, SysJob.class);
        TableInfoHelper.initTableInfo(mappings, SysJobHandler.class);
        securityStartup();
        schemaStartup();
        schemaConcurrencyAndFailures();
        scheduleStartupRecovery();
        scheduleFatalFailure();
        System.out.println("REQUEST_STARTUP_CHECKS: checks=" + checks
                + "; actual_spring_lifecycle=true; controlled_mapper_failures=true; business_requests=0; external_messages=0");
    }

    private static void securityStartup() {
        try (GenericWebApplicationContext context = new GenericWebApplicationContext()) {
            context.getBeanFactory().registerSingleton("userContextInterceptor", new UserContextInterceptor());
            context.getBeanFactory().registerSingleton("tenantInterceptor", new TenantInterceptor());
            context.getBeanFactory().registerSingleton("portalRequestInterceptor", new PortalRequestInterceptor(null, null, null, null, null));
            context.getBeanFactory().registerSingleton("oauthRequestInterceptor", new OAuthRequestInterceptor(null, null, null));
            new AnnotatedBeanDefinitionReader(context).register(SecurityWebMvcConfig.class);
            context.refresh();
            require(context.getBeansOfType(SaAnnotationStrategy.class).size() == 1, "web startup creates one annotation strategy before requests");
            SaAnnotationStrategy strategy = context.getBean(SaAnnotationStrategy.class);
            require(strategy == SaAnnotationStrategy.instance, "startup retains the library singleton used by request interception");
            require(strategy.annotationHandlerMap.containsKey(SaCheckPermission.class), "permission handler is ready at startup");
            require(strategy.annotationHandlerMap.containsKey(SaCheckRole.class), "role handler is ready at startup");
            require(strategy.annotationHandlerMap.containsKey(SaCheckLogin.class), "login handler is ready at startup");
        }
    }

    private static void schemaStartup() {
        SchemaFixture fixture = new SchemaFixture();
        fixture.mapperMetadataReady.set(false);
        try (AnnotationConfigApplicationContext context = new AnnotationConfigApplicationContext()) {
            context.addApplicationListener(event -> {
                if (event instanceof ContextRefreshedEvent) {
                    require(fixture.reads.get() == 1, "metadata initialization completes before the context is ready");
                }
            });
            context.registerBean(HolidayCalendarServiceImpl.class, fixture::service);
            context.registerBean("remainingMapperMetadata", AtomicBoolean.class, () -> {
                require(fixture.reads.get() == 0, "remaining mapper singletons initialize before the metadata query");
                fixture.mapperMetadataReady.set(true);
                return fixture.mapperMetadataReady;
            });
            require(fixture.reads.get() == 0, "bean registration does not read metadata before initialization");
            context.refresh();
            require(fixture.mapperMetadataReady.get(), "all mapper metadata is ready when startup finishes");
            require(fixture.reads.get() == 1, "Spring lifecycle resolves fixed schema metadata once before readiness");
            HolidayCalendarServiceImpl service = context.getBean(HolidayCalendarServiceImpl.class);
            service.initializeSchemaMetadata();
            require(fixture.reads.get() == 1, "repeated initialization does not reread metadata");
            require(fixture.businessReads.get() == 0, "initialization does not read attendance or calendar business rows");
        }
    }

    private static void schemaConcurrencyAndFailures() {
        SchemaFixture fixture = new SchemaFixture();
        HolidayCalendarServiceImpl service = fixture.service();
        List<CompletableFuture<Void>> readers = new ArrayList<>();
        for (int index = 0; index < 16; index++) readers.add(CompletableFuture.runAsync(service::initializeSchemaMetadata));
        CompletableFuture.allOf(readers.toArray(CompletableFuture<?>[]::new)).join();
        require(fixture.reads.get() == 1, "concurrent first users share one metadata query");
        fixture.present.set(false);
        HolidayCalendarServiceImpl absent = fixture.service();
        absent.initializeSchemaMetadata();
        absent.initializeSchemaMetadata();
        require(fixture.reads.get() == 2, "an absent optional column is also resolved only once per service");
        fixture.present.set(true);
        fixture.service().initializeSchemaMetadata();
        require(fixture.reads.get() == 3, "a fresh service resolves its own current database schema");
        HolidayCalendarServiceImpl retry = fixture.service();
        fixture.failure.set(new CannotAcquireLockException("controlled metadata read failure"));
        RuntimeException rejected = capture(retry::initializeSchemaMetadata);
        require(rejected instanceof CannotAcquireLockException, "metadata read failure remains visible");
        fixture.failure.set(null);
        retry.initializeSchemaMetadata();
        require(fixture.reads.get() == 5, "failed metadata reads do not cache an incorrect missing-column result");
        retry.initializeSchemaMetadata();
        require(fixture.reads.get() == 5, "successful retry becomes the retained schema result");
    }

    private static void scheduleStartupRecovery() {
        ScheduleFixture fixture = new ScheduleFixture();
        fixture.failures.add(new DeadlockLoserDataAccessException("controlled startup deadlock",
                new SQLTransactionRollbackException("controlled rollback", "40001", 1213)));
        fixture.failures.add(new CannotAcquireLockException("controlled second conflict"));
        Instant before = Instant.now();
        fixture.service.loadSchedules();
        Instant after = Instant.now();
        require(fixture.offlineAttempts == 1, "startup attempted stale-handler reconciliation");
        require(fixture.periodic.size() == 1, "a startup deadlock schedules automatic recovery");
        require(!fixture.periodic.get(0).at.isBefore(before.plusSeconds(5))
                && !fixture.periodic.get(0).at.isAfter(after.plusSeconds(5)), "recovery uses the existing five-second interval");
        require(fixture.jobRegistrations == 1, "enabled jobs remain registered after a transient startup conflict");
        require(fixture.dispatches.isEmpty(), "failed reconciliation does not dispatch a partial misfire scan");
        fixture.periodic.get(0).run();
        require(fixture.offlineAttempts == 2 && fixture.periodic.size() == 2, "another transient conflict preserves the periodic recovery loop");
        fixture.periodic.get(1).run();
        require(fixture.offlineAttempts == 3 && fixture.periodic.size() == 3, "reconciliation resumes after the database recovers");
        require(fixture.dispatches.size() == 1, "recovered reconciliation resumes the normal misfire scan");
        require(fixture.jobRegistrations == 1, "recovery does not register already scheduled jobs twice");
        fixture.service.loadSchedules();
        require(fixture.periodic.size() == 3 && fixture.jobRegistrations == 1, "duplicate ready notification retains one scheduler per job");
        fixture.service.shutdownSchedules();
        require(fixture.periodic.get(2).isCancelled(), "shutdown cancels the pending recovery task");
        require(fixture.jobTasks.get(0).isCancelled(), "shutdown cancels the registered business schedule");
        int attempts = fixture.offlineAttempts;
        fixture.periodic.get(2).run();
        require(fixture.offlineAttempts == attempts && fixture.periodic.size() == 3, "cancelled recovery does not start or reschedule after shutdown");
    }

    private static void scheduleFatalFailure() {
        ScheduleFixture fixture = new ScheduleFixture();
        IllegalStateException fatal = new IllegalStateException("controlled non-transient configuration failure");
        fixture.failures.add(fatal);
        require(capture(fixture.service::loadSchedules) == fatal, "non-transient failures remain fatal and are not silently accepted");
        require(fixture.periodic.isEmpty(), "fatal configuration failure does not begin an automatic retry loop");
        fixture.service.shutdownSchedules();
    }

    private static RuntimeException capture(Runnable action) {
        try { action.run(); } catch (RuntimeException failure) { return failure; }
        throw new AssertionError("Expected visible failure");
    }

    private static void require(boolean condition, String label) {
        if (!condition) throw new AssertionError(label);
        checks++;
    }

    private static <Target> Target proxy(Class<Target> type, InvocationHandler handler) {
        return type.cast(Proxy.newProxyInstance(type.getClassLoader(), new Class<?>[]{type}, handler));
    }

    private static final class SchemaFixture {
        private final AtomicInteger reads = new AtomicInteger();
        private final AtomicInteger businessReads = new AtomicInteger();
        private final AtomicBoolean present = new AtomicBoolean(true);
        private final AtomicBoolean mapperMetadataReady = new AtomicBoolean(true);
        private final AtomicReference<RuntimeException> failure = new AtomicReference<>();

        private HolidayCalendarServiceImpl service() {
            HolidayResolverMapper resolver = proxy(HolidayResolverMapper.class, (instance, method, values) -> {
                if (!method.getName().equals("hasShiftCalendarColumn")) {
                    businessReads.incrementAndGet();
                    throw new AssertionError("Unexpected business query during schema initialization");
                }
                reads.incrementAndGet();
                if (!mapperMetadataReady.get()) throw new IllegalArgumentException("Mapper result maps are still being initialized");
                RuntimeException unavailable = failure.get();
                if (unavailable != null) throw unavailable;
                return present.get();
            });
            return new HolidayCalendarServiceImpl(null, null, resolver, null);
        }
    }

    private static final class ScheduleFixture {
        private final Deque<RuntimeException> failures = new ArrayDeque<>();
        private final List<ManualFuture> periodic = new ArrayList<>();
        private final List<ManualFuture> jobTasks = new ArrayList<>();
        private final List<Runnable> dispatches = new ArrayList<>();
        private final JobPlatformService service;
        private int offlineAttempts;
        private int jobRegistrations;

        private ScheduleFixture() {
            SysJob job = new SysJob();
            job.setJobId(995901L); job.setTenantId(100000L); job.setDeleted(0);
            job.setStatus("ENABLED"); job.setServiceName("cloudflow-service-hr");
            job.setHandlerName("hrAttendanceDaily"); job.setTriggerType("CRON");
            job.setCronExpression("0 */5 * * * ?");
            SysJobMapper jobs = proxy(SysJobMapper.class, (instance, method, values) -> {
                if (method.getName().equals("selectList")) return List.of(job);
                if (method.getName().equals("selectById")) return job;
                if (method.getName().equals("update")) return 1;
                throw new AssertionError("Unexpected job operation: " + method.getName());
            });
            SysJobHandlerMapper handlers = proxy(SysJobHandlerMapper.class, (instance, method, values) -> {
                if (!method.getName().equals("update")) throw new AssertionError("Unexpected handler operation");
                offlineAttempts++;
                if (!failures.isEmpty()) throw failures.removeFirst();
                return 0;
            });
            TaskScheduler scheduler = proxy(TaskScheduler.class, (instance, method, values) -> {
                if (!method.getName().equals("schedule") || values.length != 2) throw new AssertionError("Unexpected scheduler operation");
                Runnable action = Runnable.class.cast(values[0]);
                if (values[1] instanceof Instant at) {
                    ManualFuture future = new ManualFuture(action, at);
                    periodic.add(future);
                    return future;
                }
                if (!(values[1] instanceof Trigger)) throw new AssertionError("Expected the original cron trigger");
                ManualFuture future = new ManualFuture(action, Instant.now().plusSeconds(300));
                jobTasks.add(future); jobRegistrations++;
                return future;
            });
            service = new JobPlatformService(jobs, null, handlers, null, scheduler, dispatches::add,
                    null, null, new ObjectMapper(), null, null);
        }
    }

    private static final class ManualFuture extends FutureTask<Void> implements ScheduledFuture<Void> {
        private final Instant at;
        private ManualFuture(Runnable action, Instant at) { super(action, null); this.at = at; }
        @Override public long getDelay(TimeUnit unit) { return unit.convert(Duration.between(Instant.now(), at).toNanos(), TimeUnit.NANOSECONDS); }
        @Override public int compareTo(Delayed other) { return Long.compare(getDelay(TimeUnit.NANOSECONDS), other.getDelay(TimeUnit.NANOSECONDS)); }
    }
}
