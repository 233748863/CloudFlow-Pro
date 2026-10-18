package com.cloudflow.auth.im;

import com.cloudflow.auth.mapper.ImMapper;
import com.cloudflow.common.core.utils.IpUtils;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Collections;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.ArrayList;
import java.util.concurrent.atomic.AtomicInteger;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.jdbc.core.JdbcTemplate;

final class ImLoginRequestChecks {
    private final JdbcTemplate jdbc;
    private final ImMapper mapper;
    private final ImProperties properties;
    private final StringRedisTemplate redis;
    private final ImLoginAccounts.Account account;
    private final AtomicInteger assertions = new AtomicInteger();

    ImLoginRequestChecks(JdbcTemplate jdbc, ImMapper mapper, ImProperties properties, StringRedisTemplate redis, ImLoginAccounts.Account account) {
        this.jdbc = jdbc; this.mapper = mapper; this.properties = properties; this.redis = redis; this.account = account;
    }

    void run() {
        ImLoginRequests requests = new ImLoginRequests(properties, mapper, redis);
        equal(0, jdbc.queryForObject("SELECT COUNT(*) FROM sys_ip_acl WHERE rule_code LIKE 'g4-flow-%'", Integer.class), "owned IP rules initially absent");
        IpUtils.setTrustedProxies(List.of("10.0.0.0/8"));
        try {
            rejected(() -> requests.begin(request("203.0.113.1", false, Map.of("X-Forwarded-Proto", List.of("https"))), false), "IM_LOGIN_TRANSPORT_INVALID");
            HttpServletRequest direct = requests.begin(request("203.0.113.2", true, Map.of("X-Forwarded-For", List.of("192.0.2.1"))), false);
            equal("203.0.113.2", direct.getRemoteAddr(), "untrusted source cannot spoof IP");
            equal(null, direct.getHeader("X-Forwarded-For"), "forwarded address removed");
            check(!direct.getHeaders("X-Forwarded-For").hasMoreElements(), "forwarded address enumeration removed");
            check(Collections.list(direct.getHeaderNames()).stream().noneMatch(name -> name.equalsIgnoreCase("X-Forwarded-For")), "forwarded address name removed");
            HttpServletRequest forwarded = requests.begin(request("10.0.0.1", false,
                    Map.of("X-Forwarded-Proto", List.of("https"), "X-Forwarded-For", List.of("192.0.2.1, 203.0.113.3, 10.0.0.2"))), false);
            equal("203.0.113.3", forwarded.getRemoteAddr(), "rightmost untrusted hop selected");
            equal("203.0.113.3", IpUtils.getIpAddr(forwarded), "shared login logs use same normalized address");
            for (String name : List.of("Origin", "Sec-Fetch-Site", "X-Forwarded-Proto", "X-Forwarded-For")) {
                Map<String, List<String>> headers = new java.util.HashMap<>();
                headers.put("X-Forwarded-Proto", List.of("https"));
                headers.put(name, List.of("https", "https"));
                rejected(() -> requests.begin(request("10.0.0.1", false, headers), false), "IM_LOGIN_TRANSPORT_INVALID");
            }
            for (String invalid : List.of("localhost", "deadbeef", "2130706433", "127.1", "01.2.3.4", "256.0.0.1", "::1%1", "[::1]", "", "1.2.3.4:443")) {
                rejected(() -> requests.begin(request(invalid, true, Map.of()), false), "IM_LOGIN_TRANSPORT_INVALID");
            }
            for (Map<String, List<String>> headers : List.of(Map.of("Origin", List.of("https://evil.test")), Map.of("Sec-Fetch-Site", List.of("cross-site")))) {
                rejected(() -> requests.begin(request("203.0.113.4", true, headers), false), "IM_LOGIN_TRANSPORT_INVALID");
                equal("203.0.113.4", requests.begin(request("203.0.113.4", true, headers), true).getRemoteAddr(), "provider callback may be cross-site with state protection");
            }
            for (String chain : List.of("", "invalid", "203.0.113.1,", "203.0.113.1,".repeat(21), "1".repeat(1025))) {
                rejected(() -> requests.begin(request("10.0.0.1", true, Map.of("X-Forwarded-For", List.of(chain))), false), "IM_LOGIN_TRANSPORT_INVALID");
            }
            patterns();
            database(requests);
            for (int index = 0; index < 20; index++) requests.begin(request("192.0.2.90", true, Map.of()), false);
            rejected(() -> requests.begin(request("192.0.2.90", true, Map.of()), false), "IM_LOGIN_RATE_LIMITED");
            Long ttl = redis.getExpire("cloudflow:im:login-limit:ip:" + ImLoginChallenges.digest("192.0.2.90"));
            check(ttl != null && ttl > 0 && ttl <= 60, "IP counter expires within 60 seconds");
            concurrent(requests);
        } finally {
            IpUtils.setTrustedProxies(List.of());
            jdbc.update("DELETE FROM sys_ip_acl WHERE rule_code LIKE 'g4-flow-%'");
            redis.delete("cloudflow:im:login-limit:account:" + account.tenantId() + ":" + account.userId());
        }
        System.out.println("G4_IM_LOGIN_REQUESTS: assertions=" + assertions + "; failed=0; real_mysql=true; real_redis=true; numeric_addresses_only=true; concurrent_account_limit=5; global_acl_semantics=preserved");
    }

    private void patterns() {
        byte[] ipv4 = ImLoginRequests.numeric("192.0.2.10");
        byte[] ipv6 = ImLoginRequests.numeric("2001:db8::10");
        check(matches(ipv4, "192.0.2.10", "EXACT"), "exact IPv4");
        check(!matches(ipv4, "192.0.2.11", "EXACT"), "exact IPv4 mismatch");
        check(matches(ipv6, "2001:0db8:0:0:0:0:0:10", "EXACT"), "canonical IPv6 equality");
        check(matches(ipv4, "192.0.2.0/24", "CIDR"), "IPv4 CIDR");
        check(!matches(ipv4, "192.0.3.0/24", "CIDR"), "IPv4 CIDR outside");
        check(matches(ipv4, "0.0.0.0/0", "CIDR"), "zero prefix matches");
        check(matches(ipv4, "192.0.2.10/32", "CIDR"), "full prefix matches");
        check(matches(ipv6, "2001:db8::/32", "CIDR"), "IPv6 CIDR");
        check(!matches(ipv6, "192.0.2.0/24", "CIDR"), "different address families do not match");
        check(matches(ipv4, "192.0.2.1-192.0.2.10", "RANGE"), "inclusive upper boundary");
        check(matches(ipv4, "192.0.2.20-192.0.2.10", "RANGE"), "reversed range compatibility");
        check(!matches(ipv4, "192.0.2.11-192.0.2.20", "RANGE"), "outside range");
        check(matches(ipv6, "2001:db8::1-2001:db8::20", "RANGE"), "IPv6 range");
        for (String invalid : List.of("192.0.2.0/33", "2001:db8::/129", "192.0.2.0/-1", "192.0.2.0/")) {
            rejected(() -> matches(ipv4, invalid, "CIDR"), "IM_LOGIN_CHALLENGE_UNAVAILABLE");
        }
    }

    private void database(ImLoginRequests requests) {
        HttpServletRequest request = request("203.0.113.70", true, Map.of());
        insert("black", "203.0.113.0/24", "CIDR", "BLACK", 2);
        rejected(() -> requests.recheck(request), "IM_LOGIN_IP_DENIED");
        insert("white", "203.0.113.70", "EXACT", "WHITE", 1);
        requests.recheck(request);
        check(true, "first matching whitelist precedes blacklist");
        jdbc.update("UPDATE sys_ip_acl SET expire_at=NOW()-INTERVAL 1 SECOND WHERE rule_code='g4-flow-white'");
        rejected(() -> requests.recheck(request), "IM_LOGIN_IP_DENIED");
        jdbc.update("UPDATE sys_ip_acl SET status='INACTIVE' WHERE rule_code='g4-flow-black'");
        requests.recheck(request);
        check(true, "inactive and expired rules ignored");
        jdbc.update("UPDATE sys_ip_acl SET status='ACTIVE',deleted=1 WHERE rule_code='g4-flow-black'");
        requests.recheck(request);
        check(true, "deleted rules ignored");
        jdbc.update("DELETE FROM sys_ip_acl WHERE rule_code LIKE 'g4-flow-%'");
    }

    private void concurrent(ImLoginRequests requests) {
        ExecutorService pool = Executors.newFixedThreadPool(12);
        CountDownLatch start = new CountDownLatch(1);
        List<Future<Boolean>> results = new ArrayList<>();
        try {
            for (int index = 0; index < 24; index++) results.add(pool.submit(() -> {
                if (!start.await(5, TimeUnit.SECONDS)) throw new AssertionError("Counter start timeout");
                try { requests.account(account); return true; }
                catch (ImFailure failure) { equal("IM_LOGIN_RATE_LIMITED", failure.getReasonCode(), "concurrent counter fails closed"); return false; }
            }));
            start.countDown();
            int accepted = 0;
            for (Future<Boolean> result : results) if (result.get(10, TimeUnit.SECONDS)) accepted++;
            equal(5, accepted, "atomic account limit allows exactly five of 24 callers");
        } catch (Exception failure) { throw new AssertionError(failure); }
        finally { pool.shutdownNow(); }
    }

    private void insert(String suffix, String pattern, String type, String mode, int priority) {
        jdbc.update("INSERT INTO sys_ip_acl(tenant_id,rule_code,rule_name,ip_pattern,rule_type,mode,priority) VALUES(0,?, 'flow request check',?,?,?,?)",
                "g4-flow-" + suffix, pattern, type, mode, priority);
    }
    private boolean matches(byte[] address, String pattern, String type) { return ImLoginRequests.matches(address, new ImLoginRequests.IpRule(pattern, type, "BLACK")); }
    private HttpServletRequest request(String address, boolean secure, Map<String, List<String>> headers) { return ImLoginFlowDatabaseChecks.request(address, secure, headers, List.of()); }
    private void rejected(Runnable operation, String reason) {
        try { operation.run(); throw new AssertionError("Expected " + reason); }
        catch (ImFailure failure) { equal(reason, failure.getReasonCode(), "safe rejection reason"); }
    }
    private void check(boolean success, String message) { assertions.incrementAndGet(); if (!success) throw new AssertionError(message); }
    private void equal(Object expected, Object actual, String message) { check(Objects.equals(expected, actual), message); }
}
