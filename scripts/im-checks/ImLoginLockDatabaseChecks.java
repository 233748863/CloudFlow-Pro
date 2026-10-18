package com.cloudflow.auth.im;

import java.util.List;
import java.util.Objects;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.springframework.jdbc.core.JdbcTemplate;

final class ImLoginLockDatabaseChecks {
    private final JdbcTemplate jdbc;
    private final ImLoginAccounts accounts;
    private final ImLoginAccounts.Account account;
    private int assertions;

    ImLoginLockDatabaseChecks(JdbcTemplate jdbc, ImLoginAccounts accounts, ImLoginAccounts.Account account) {
        this.jdbc = jdbc; this.accounts = accounts; this.account = account;
    }

    void run() {
        List<Mutation> mutations = List.of(
                new Mutation("configuration", "UPDATE sys_im_config SET version=version+1 WHERE tenant_id=?", "UPDATE sys_im_config SET version=version-1 WHERE tenant_id=?", "IM_LOGIN_ACCOUNT_UNAVAILABLE"),
                new Mutation("binding", "UPDATE sys_im_user_mapping SET version=version+1 WHERE tenant_id=?", "UPDATE sys_im_user_mapping SET version=version-1 WHERE tenant_id=?", "IM_LOGIN_ACCOUNT_UNAVAILABLE"),
                new Mutation("user", "UPDATE sys_user SET version=version+1 WHERE tenant_id=?", "UPDATE sys_user SET version=version-1 WHERE tenant_id=?", "IM_LOGIN_ACCOUNT_UNAVAILABLE"),
                new Mutation("package", "UPDATE sys_tenant SET effective_menu_ids='[2]' WHERE tenant_id=?", "UPDATE sys_tenant SET effective_menu_ids='[2,1788]' WHERE tenant_id=?", "IM_LOGIN_PACKAGE_UNAVAILABLE"),
                new Mutation("menu", "UPDATE sys_menu SET status='1' WHERE menu_id=1788 AND ? > 0", "UPDATE sys_menu SET status='0' WHERE menu_id=1788 AND ? > 0", "IM_LOGIN_PACKAGE_UNAVAILABLE"),
                new Mutation("totp-enrollment", "INSERT INTO sys_user_totp(tenant_id,user_id,secret_ciphertext,enabled) VALUES(?,990201,'unusable-test-cipher',1)", "DELETE FROM sys_user_totp WHERE tenant_id=?", null));
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            for (Mutation mutation : mutations) {
                CountDownLatch acquired = new CountDownLatch(1);
                CountDownLatch release = new CountDownLatch(1);
                CountDownLatch writerStarted = new CountDownLatch(1);
                Future<Long> login = pool.submit(() -> accounts.locked(account, (user, tenant) -> {
                    acquired.countDown();
                    await(release);
                    return user.getUserId();
                }));
                Future<Integer> update = null;
                try {
                    check(acquired.await(15, TimeUnit.SECONDS), "login lock acquisition bounded");
                    update = pool.submit(() -> { writerStarted.countDown(); return jdbc.update(mutation.change(), account.tenantId()); });
                    check(writerStarted.await(5, TimeUnit.SECONDS), "writer started");
                    try { update.get(300, TimeUnit.MILLISECONDS); throw new AssertionError("Concurrent mutation escaped lock: " + mutation.name()); }
                    catch (TimeoutException expected) { check(true, "mutation waits for final login transaction"); }
                    String table = switch (mutation.name()) {
                        case "configuration" -> "sys_im_config";
                        case "binding" -> "sys_im_user_mapping";
                        case "user" -> "sys_user";
                        case "package" -> "sys_tenant";
                        case "menu" -> "sys_menu";
                        case "totp-enrollment" -> "sys_user_totp";
                        default -> throw new AssertionError("Unexpected lock target");
                    };
                    Integer waiting = jdbc.queryForObject("SELECT COUNT(*) FROM performance_schema.data_lock_waits waiting JOIN performance_schema.data_locks requested ON requested.ENGINE_LOCK_ID=waiting.REQUESTING_ENGINE_LOCK_ID AND requested.ENGINE=waiting.ENGINE WHERE requested.OBJECT_SCHEMA=DATABASE() AND requested.OBJECT_NAME=?", Integer.class, table);
                    check(waiting != null && waiting > 0, "database confirms requested table lock wait");
                    release.countDown();
                    check(Objects.equals(account.userId(), login.get(10, TimeUnit.SECONDS)), "unchanged identity completes before waiting mutation");
                    check(update.get(10, TimeUnit.SECONDS) == 1, "mutation completes after transaction commit");
                    if (mutation.reason() != null) {
                        try { accounts.recheck(account); throw new AssertionError("Stale identity accepted"); }
                        catch (ImFailure failure) { check(mutation.reason().equals(failure.getReasonCode()), "committed mutation invalidates old proof"); }
                    }
                    System.out.println("G4_IM_LOGIN_LOCK: resource=" + mutation.name() + "; blocked_before_commit=true; database_lock_wait_confirmed=true; writer_completed=true; real_mysql=true");
                } finally {
                    release.countDown();
                    login.get(15, TimeUnit.SECONDS);
                    if (update != null) { update.get(15, TimeUnit.SECONDS); jdbc.update(mutation.restore(), account.tenantId()); }
                }
            }
        } catch (Exception failure) { throw new AssertionError(failure); }
        finally { pool.shutdownNow(); }
        System.out.println("G4_IM_LOGIN_LOCK_DATABASE: assertions=" + assertions + "; resources=6; failed=0; real_transactions=true");
    }

    private void await(CountDownLatch latch) {
        try { if (!latch.await(15, TimeUnit.SECONDS)) throw new AssertionError("Login lock release timed out"); }
        catch (InterruptedException failure) { Thread.currentThread().interrupt(); throw new AssertionError(failure); }
    }
    private void check(boolean success, String message) { assertions++; if (!success) throw new AssertionError(message); }
    private record Mutation(String name, String change, String restore, String reason) { }
}
