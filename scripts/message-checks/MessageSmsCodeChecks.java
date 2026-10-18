package com.cloudflow.auth.message;

import cn.hutool.crypto.digest.BCrypt;
import com.cloudflow.auth.domain.dto.SmsCodeSendDTO;
import com.cloudflow.auth.domain.dto.SmsCodeVerifyDTO;
import com.cloudflow.auth.mapper.SysSmsCodeMapper;
import com.cloudflow.auth.service.CaptchaService;
import com.cloudflow.auth.service.SmsCodeService;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ServiceException;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Proxy;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

/** Actual SMS service and MySQL; captcha pass and provider availability are controlled doubles. */
final class MessageSmsCodeChecks {
    private static final String PHONE = "13800009123";
    private static final String SCENE = "A2_SMS_CHECK";
    private static final String CODE = "173829";
    private static final String HASH = BCrypt.hashpw(CODE, BCrypt.gensalt(4));

    static void run(MessageDeliveryDatabaseChecks suite) throws Exception {
        int before = suite.checks.get();
        basic(suite);
        concurrentFailures(suite);
        concurrentSuccesses(suite);
        staleReader(suite, false, "used");
        staleReader(suite, true, "locked");
        staleReader(suite, true, "expired");
        System.out.println("A2_SMS_CODE_CHECKS: assertions=" + (suite.checks.get() - before)
                + "; failed=0; mysql=true; actual_service=true; concurrent=true; sms_vendor=false; captcha_double=true");
    }

    private static void basic(MessageDeliveryDatabaseChecks suite) {
        SmsCodeService service = service(suite.mapper(SysSmsCodeMapper.class));
        seed(suite);
        SmsCodeSendDTO send = new SmsCodeSendDTO();
        send.setPhone(PHONE); send.setBizScene(SCENE); send.setCaptchaToken("controlled-pass");
        expectRejected(suite, () -> service.send(send, null), "60秒", "recent successful SMS prevents resend within 60 seconds");
        suite.check(suite.jdbc.queryForObject("SELECT COUNT(*) FROM sys_sms_code WHERE phone=? AND biz_scene=?", Integer.class, PHONE, SCENE) == 1,
                "rejected resend creates no new code");
        verify(service, CODE);
        suite.check(used(suite) == 1, "successful SMS verification persists consumed state");
        expectRejected(suite, () -> verify(service, CODE), null, "consumed SMS code cannot be used again");
        seed(suite);
        suite.jdbc.update("UPDATE sys_sms_code SET expire_time=DATE_SUB(NOW(),INTERVAL 1 SECOND) WHERE phone=? AND biz_scene=?", PHONE, SCENE);
        expectRejected(suite, () -> verify(service, CODE), "过期", "expired SMS code is rejected");
        suite.check(used(suite) == 0, "expired code is not marked as successfully consumed");
        seed(suite);
        try {
            UserContext.setTenantId(100001L);
            expectRejected(suite, () -> verify(service, CODE), null, "another tenant cannot consume SMS code");
        } finally { UserContext.setTenantId(suite.TENANT); }
        SmsCodeVerifyDTO wrongScene = request(CODE); wrongScene.setBizScene(SCENE + "_OTHER");
        expectRejected(suite, () -> service.verify(wrongScene), null, "another business scene cannot consume SMS code");
        for (int attempt = 0; attempt < 5; attempt++) expectRejected(suite, () -> verify(service, "000000"), null, "wrong SMS attempt is rejected");
        suite.check(failures(suite) == 5, "five sequential failures remain durable after rejection");
        expectRejected(suite, () -> verify(service, CODE), "次数过多", "five failures block even a matching code");
    }

    private static void concurrentFailures(MessageDeliveryDatabaseChecks suite) throws Exception {
        seed(suite);
        List<Boolean> results = concurrent(suite, "000000", 8);
        suite.check(results.stream().noneMatch(Boolean::booleanValue), "eight concurrent wrong codes are rejected");
        suite.check(failures(suite) == 5, "concurrent SMS failures increment atomically and stop at five");
        expectRejected(suite, () -> verify(service(suite.mapper(SysSmsCodeMapper.class)), CODE), null, "concurrent failure limit prevents subsequent success");
    }

    private static void concurrentSuccesses(MessageDeliveryDatabaseChecks suite) throws Exception {
        seed(suite);
        List<Boolean> results = concurrent(suite, CODE, 4);
        suite.check(results.stream().filter(Boolean::booleanValue).count() == 1, "four concurrent matching codes produce exactly one success");
        suite.check(used(suite) == 1, "concurrent success leaves code consumed");
    }

    private static List<Boolean> concurrent(MessageDeliveryDatabaseChecks suite, String code, int count) throws Exception {
        CyclicBarrier readers = new CyclicBarrier(count);
        SmsCodeService service = service(observed(suite, () -> {
            try { readers.await(15, TimeUnit.SECONDS); } catch (Exception failure) { throw new IllegalStateException(failure); }
        }));
        ExecutorService executor = Executors.newFixedThreadPool(count);
        try {
            List<Future<Boolean>> futures = new ArrayList<Future<Boolean>>();
            for (int worker = 0; worker < count; worker++) futures.add(executor.submit(() -> outcome(suite, service, code)));
            List<Boolean> results = new ArrayList<Boolean>();
            for (Future<Boolean> future : futures) results.add(future.get(25, TimeUnit.SECONDS));
            return results;
        } finally { executor.shutdownNow(); executor.awaitTermination(5, TimeUnit.SECONDS); }
    }

    private static void staleReader(MessageDeliveryDatabaseChecks suite, boolean correct, String mutation) throws Exception {
        seed(suite);
        CountDownLatch read = new CountDownLatch(1);
        CountDownLatch resume = new CountDownLatch(1);
        SmsCodeService delayed = service(observed(suite, () -> {
            read.countDown();
            try { if (!resume.await(15, TimeUnit.SECONDS)) throw new IllegalStateException("SMS_READ_GATE_TIMEOUT"); }
            catch (InterruptedException failure) { Thread.currentThread().interrupt(); throw new IllegalStateException(failure); }
        }));
        ExecutorService executor = Executors.newSingleThreadExecutor();
        try {
            Future<Boolean> result = executor.submit(() -> outcome(suite, delayed, correct ? CODE : "000000"));
            if (!read.await(15, TimeUnit.SECONDS)) throw new IllegalStateException("SMS_READ_TIMEOUT");
            SmsCodeService normal = service(suite.mapper(SysSmsCodeMapper.class));
            if ("used".equals(mutation)) verify(normal, CODE);
            if ("locked".equals(mutation)) {
                for (int attempt = 0; attempt < 5; attempt++) {
                    try { verify(normal, "000000"); } catch (ServiceException expected) { /* rejection retains failure count */ }
                }
            }
            if ("expired".equals(mutation)) suite.jdbc.update("UPDATE sys_sms_code SET expire_time=DATE_SUB(NOW(),INTERVAL 1 SECOND) WHERE phone=? AND biz_scene=?", PHONE, SCENE);
            resume.countDown();
            suite.check(!result.get(20, TimeUnit.SECONDS), "stale SMS reader is rejected after concurrent " + mutation);
            if ("used".equals(mutation)) {
                suite.check(used(suite) == 1, "stale incorrect SMS request cannot reactivate a consumed code");
                expectRejected(suite, () -> verify(normal, CODE), null, "SMS remains non-replayable after stale failure");
            } else {
                suite.check(used(suite) == 0, "stale success cannot consume a now " + mutation + " code");
            }
        } finally { resume.countDown(); executor.shutdownNow(); executor.awaitTermination(5, TimeUnit.SECONDS); }
    }

    private static SysSmsCodeMapper observed(MessageDeliveryDatabaseChecks suite, Runnable afterRead) {
        SysSmsCodeMapper delegate = suite.mapper(SysSmsCodeMapper.class);
        return (SysSmsCodeMapper) Proxy.newProxyInstance(SysSmsCodeMapper.class.getClassLoader(), new Class<?>[] { SysSmsCodeMapper.class }, (proxy, method, arguments) -> {
            try {
                Object result = method.invoke(delegate, arguments);
                if ("selectList".equals(method.getName()) && method.getParameterCount() == 1) afterRead.run();
                return result;
            } catch (InvocationTargetException failure) { throw failure.getCause(); }
        });
    }

    private static SmsCodeService service(SysSmsCodeMapper mapper) {
        CaptchaService captcha = new CaptchaService() {
            @Override public boolean validatePassToken(String token, String ip) { return "controlled-pass".equals(token); }
        };
        return new SmsCodeService(mapper, null, null, captcha, null);
    }

    private static boolean outcome(MessageDeliveryDatabaseChecks suite, SmsCodeService service, String code) {
        UserContext.setTenantId(suite.TENANT);
        try { verify(service, code); return true; }
        catch (ServiceException expected) { return false; }
        finally { UserContext.clear(); }
    }

    private static void seed(MessageDeliveryDatabaseChecks suite) {
        suite.jdbc.update("DELETE FROM sys_sms_code WHERE phone=? AND biz_scene=?", PHONE, SCENE);
        suite.jdbc.update("INSERT INTO sys_sms_code(tenant_id,phone,code_hash,biz_scene,expire_time,used_flag,verify_fail_count,create_time) VALUES (?,?,?,?,DATE_ADD(NOW(),INTERVAL 5 MINUTE),0,0,NOW())", suite.TENANT, PHONE, HASH, SCENE);
    }

    private static int used(MessageDeliveryDatabaseChecks suite) {
        return suite.jdbc.queryForObject("SELECT used_flag FROM sys_sms_code WHERE phone=? AND biz_scene=?", Integer.class, PHONE, SCENE);
    }
    private static int failures(MessageDeliveryDatabaseChecks suite) {
        return suite.jdbc.queryForObject("SELECT verify_fail_count FROM sys_sms_code WHERE phone=? AND biz_scene=?", Integer.class, PHONE, SCENE);
    }
    private static SmsCodeVerifyDTO request(String code) {
        SmsCodeVerifyDTO dto = new SmsCodeVerifyDTO(); dto.setPhone(PHONE); dto.setBizScene(SCENE); dto.setCode(code); return dto;
    }
    private static void verify(SmsCodeService service, String code) { service.verify(request(code)); }
    private static void expectRejected(MessageDeliveryDatabaseChecks suite, Runnable operation, String message, String description) {
        boolean rejected = false;
        try { operation.run(); } catch (ServiceException expected) { rejected = message == null || expected.getMessage().contains(message); }
        suite.check(rejected, description);
    }
}
