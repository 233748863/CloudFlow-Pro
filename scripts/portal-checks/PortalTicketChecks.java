package com.cloudflow.crm.service.impl;

import com.cloudflow.auth.controller.PortalFileController;
import com.cloudflow.auth.portal.PortalFileTickets;
import com.cloudflow.auth.portal.PortalTicketFileTokens;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PortalFileVO;
import com.cloudflow.common.core.domain.PortalTicketRequest;
import com.cloudflow.common.core.domain.PortalTicketVO;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.security.portal.PortalIdentity;
import com.cloudflow.common.security.portal.PortalPaths;
import com.cloudflow.common.sensitive.config.SensitiveBeanSerializerModifier;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.crm.domain.CrmServiceTicket;
import com.cloudflow.crm.domain.dto.CrmPortalTicketCommands;
import com.cloudflow.crm.mapper.CrmServiceTicketMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.module.SimpleModule;
import java.lang.reflect.Field;
import java.lang.reflect.Proxy;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.data.redis.core.script.RedisScript;

public final class PortalTicketChecks {
    private static int checks;
    private static final PortalIdentity IDENTITY = new PortalIdentity(13L, 100000L, 21L, 34L, 0, 1);

    public static void main(String[] arguments) throws Exception {
        inputs(); paths(); serialization(); tokens(); reassignmentRace();
        System.out.println("PORTAL_TICKET_RULE_CHECKS: assertions=" + checks
                + "; failed=0; actual_production_classes=true; redis_double=true; mapper_double=true; mysql=false; http=false; production_modified=false");
    }

    private static PortalTicketRequest request() {
        PortalTicketRequest result = new PortalTicketRequest(); result.setRequestKey(UUID.randomUUID().toString());
        result.setTitle(" 客户问题 "); result.setDescription(" 原始描述\n保留换行 "); result.setFileIds(List.of(3L, 1L, 2L)); return result;
    }

    private static void inputs() {
        PortalTicketRequest valid = request(); CrmPortalTicketPolicy.validate(valid);
        check(valid.getTitle().equals("客户问题") && valid.getDescription().equals("原始描述\n保留换行"), "trimmed original text retained");
        check(valid.getFileIds().equals(List.of(1L, 2L, 3L)), "file order canonicalized for idempotent retries");
        String number = CrmPortalTicketPolicy.number(IDENTITY, valid.getRequestKey());
        check(number.length() == 47 && number.equals(CrmPortalTicketPolicy.number(IDENTITY, valid.getRequestKey())), "request has stable bounded ticket number");
        check(!number.equals(CrmPortalTicketPolicy.number(new PortalIdentity(14L, 100000L, 21L, 34L, 0, 1), valid.getRequestKey())), "other account cannot query the same submission key");
        expect(400, () -> CrmPortalTicketPolicy.validate(null));
        for (String key : List.of("", " ", "a".repeat(36), UUID.randomUUID().toString().toUpperCase(), "../unsafe")) expect(400, () -> CrmPortalTicketPolicy.requestKey(key));
        for (String title : List.of("", " ", "a".repeat(121), "bad\u0000text", "bad\u007ftext")) {
            PortalTicketRequest input = request(); input.setTitle(title); expect(400, () -> CrmPortalTicketPolicy.validate(input));
        }
        PortalTicketRequest boundary = request(); boundary.setTitle("题".repeat(120)); boundary.setDescription("述".repeat(1000));
        boundary.setFileIds(List.of(1L, 2L, 3L, 4L, 5L, 6L, 7L, 8L, 9L, 10L)); CrmPortalTicketPolicy.validate(boundary); checks++;
        boundary.setDescription("述".repeat(1001)); expect(400, () -> CrmPortalTicketPolicy.validate(boundary));
        for (List<Long> files : Arrays.asList(null, List.of(0L), List.of(-1L), List.of(1L, 1L), Arrays.asList(1L, null), List.of(1L, 2L, 3L, 4L, 5L, 6L, 7L, 8L, 9L, 10L, 11L))) {
            PortalTicketRequest input = request(); input.setFileIds(files); expect(400, () -> CrmPortalTicketPolicy.validate(input));
        }
        CrmServiceTicket ticket = new CrmServiceTicket(); ticket.setPortalContactId(34L); ticket.setTicketTitle("original"); ticket.setDescription("customer input");
        check(CrmPortalTicketPolicy.pending(ticket), "portal ticket without handler is pending"); expect(409, () -> CrmPortalTicketPolicy.requireAssigned(ticket));
        expect(400, () -> CrmPortalTicketPolicy.protectCreate(ticket));
        CrmServiceTicket mutation = new CrmServiceTicket(); mutation.setOwnerId(1L); expect(403, () -> CrmPortalTicketPolicy.protectUpdate(mutation, ticket));
        mutation.setOwnerId(null); mutation.setTicketTitle("rewritten"); expect(400, () -> CrmPortalTicketPolicy.protectUpdate(mutation, ticket));
        mutation.setTicketTitle("original"); mutation.setDescription("rewritten"); expect(400, () -> CrmPortalTicketPolicy.protectUpdate(mutation, ticket));
        mutation.setDescription("customer input"); mutation.setPortalSolution("bypass publish"); expect(400, () -> CrmPortalTicketPolicy.protectUpdate(mutation, ticket));
        mutation.setPortalSolution(null); CrmPortalTicketPolicy.protectUpdate(mutation, ticket); checks++;
        ticket.setOwnerId(1L); CrmPortalTicketPolicy.requireAssigned(ticket); checks++;
        expect(400, () -> CrmPortalTicketPolicy.text("x".repeat(10001), 10000, "方案"));
        check(CrmPortalTicketPolicy.text("x".repeat(10000), 10000, "方案").length() == 10000, "publication boundary accepted");
    }

    private static void paths() {
        String key = UUID.randomUUID().toString();
        for (Map.Entry<String, List<String>> group : Map.of("POST", List.of("/portal/crm/ticket", "/portal/file/upload"),
                "GET", List.of("/portal/crm/ticket/list", "/portal/crm/ticket/1", "/portal/crm/ticket/submission/" + key, "/portal/file/upload/" + key),
                "DELETE", List.of("/portal/file/1")).entrySet()) {
            for (String route : group.getValue()) {
                check(PortalPaths.supported(group.getKey(), route) && !PortalPaths.publicEndpoint(group.getKey(), route), "approved route stays authenticated");
                for (String method : List.of("GET", "POST", "PUT", "DELETE", "PATCH")) if (!method.equals(group.getKey())) check(!PortalPaths.supported(method, route), "no write or read method aliases");
            }
        }
        for (String route : List.of("/portal/crm/ticket/0", "/portal/crm/ticket/-1", "/portal/crm/ticket/01", "/portal/crm/ticket/1/assign", "/portal/file/upload/", "/portal/file/upload;other", "/portal/file/1/content", "/portal/crm/ticket/submission/invalid")) {
            for (String method : List.of("GET", "POST", "PUT", "DELETE")) check(!PortalPaths.supported(method, route), "noncanonical or internal route stays closed");
        }
    }

    private static void serialization() throws Exception {
        SimpleModule module = new SimpleModule(); module.setSerializerModifier(new SensitiveBeanSerializerModifier());
        ObjectMapper json = new ObjectMapper().registerModule(module);
        for (String property : List.of("tenantId", "customerId", "ownerId", "status", "portalContactId", "portalSolution", "solution", "firstResponseTime", "url", "version")) {
            unknown(json, "{\"requestKey\":\"" + UUID.randomUUID() + "\",\"title\":\"问题\",\"description\":\"描述\",\"" + property + "\":1}", PortalTicketRequest.class);
        }
        for (String property : List.of("tenantId", "ownerName", "customerId", "status", "ticketId")) {
            unknown(json, "{\"version\":0,\"ownerId\":1,\"" + property + "\":1}", CrmPortalTicketCommands.Assignment.class);
            unknown(json, "{\"version\":0,\"publish\":true,\"solution\":\"明确发布\",\"" + property + "\":1}", CrmPortalTicketCommands.Publication.class);
        }
        unknown(json, "{\"resourceType\":\"TICKET\",\"ticketId\":1,\"fileId\":2,\"url\":\"secret\"}", PortalFileController.KnowledgeAccess.class);
        PortalFileVO file = new PortalFileVO(); file.setFileId(2L); file.setFileName("customer.txt"); file.setFileSize(4L); file.setExtension("txt");
        JsonNode fields = json.valueToTree(file); check(fields.size() == 4 && !fields.has("filePath") && !fields.has("portalOwnerId"), "file projection excludes private storage and identity");
        PortalTicketVO ticket = new PortalTicketVO(); ticket.setTicketId(1L); ticket.setAttachments(List.of(file));
        JsonNode exposed = json.valueToTree(ticket);
        for (String hidden : List.of("tenantId", "customerId", "ownerId", "createBy", "attachmentUrl", "portalContactId", "version")) check(!exposed.has(hidden), "portal ticket excludes internal property " + hidden);
    }

    private static void tokens() throws Exception {
        MemoryRedis redis = new MemoryRedis(); ObjectMapper json = new ObjectMapper(); PortalTicketFileTokens service = new PortalTicketFileTokens(redis, json);
        String session = "p_" + "a".repeat(43);
        expect(404, () -> service.issue(null, session, "TICKET", 1L, 2L));
        expect(404, () -> service.issue(IDENTITY, null, "TICKET", 1L, 2L));
        for (String kind : List.of("KNOWLEDGE", "", "INTERNAL")) expect(404, () -> service.issue(IDENTITY, session, kind, 1L, 2L));
        expect(404, () -> service.issue(IDENTITY, session, "UPLOAD", 1L, 2L));
        expect(404, () -> service.issue(IDENTITY, session, "TICKET", null, 2L));
        expect(404, () -> service.issue(IDENTITY, session, "TICKET", 1L, 0L));
        PortalFileTickets.Access access = service.issue(IDENTITY, session, "TICKET", 1L, 2L);
        check(access.downloadTicket().matches("tf_[A-Za-z0-9_-]{43}") && access.expiresIn() == 60, "dedicated 256-bit credential has 60-second lifetime");
        check(redis.values.keySet().stream().allMatch(key -> key.matches("cloudflow:portal:ticket-file:[0-9a-f]{64}")), "raw credential is not a Redis key");
        expect(404, () -> service.consume(access.downloadTicket(), IDENTITY, "p_" + "b".repeat(43)));
        for (PortalIdentity other : List.of(new PortalIdentity(14L, 100000L, 21L, 34L, 0, 1), new PortalIdentity(13L, 100001L, 21L, 34L, 0, 1), new PortalIdentity(13L, 100000L, 22L, 34L, 0, 1), new PortalIdentity(13L, 100000L, 21L, 35L, 0, 1), new PortalIdentity(13L, 100000L, 21L, 34L, 1, 1), new PortalIdentity(13L, 100000L, 21L, 34L, 0, 2))) expect(404, () -> service.consume(access.downloadTicket(), other, session));
        check(service.consume(access.downloadTicket(), IDENTITY, session).fileId().equals(2L), "failed foreign consumers do not consume owner ticket");
        expect(404, () -> service.consume(access.downloadTicket(), IDENTITY, session));
        expect(404, () -> service.consume("kf_" + "a".repeat(43), IDENTITY, session));
        for (String damaged : List.of("null", "{}", "[1]", "invalid", "x".repeat(2049))) {
            PortalFileTickets.Access issued = service.issue(IDENTITY, session, "UPLOAD", null, 3L);
            redis.values.replaceAll((key, value) -> damaged); expect(404, () -> service.consume(issued.downloadTicket(), IDENTITY, session)); redis.values.clear();
        }
        PortalFileTickets.Access audience = service.issue(IDENTITY, session, "UPLOAD", null, 3L);
        redis.values.replaceAll((key, value) -> value.replace("PORTAL_TICKET_DOWNLOAD", "PORTAL_KNOWLEDGE_DOWNLOAD"));
        expect(404, () -> service.consume(audience.downloadTicket(), IDENTITY, session)); redis.values.clear();
        PortalFileTickets.Access shared = service.issue(IDENTITY, session, "TICKET", 1L, 2L);
        ExecutorService executor = Executors.newFixedThreadPool(8); AtomicInteger winners = new AtomicInteger();
        try {
            List<Future<?>> attempts = new ArrayList<>();
            for (int index = 0; index < 24; index++) attempts.add(executor.submit(() -> {
                try { service.consume(shared.downloadTicket(), IDENTITY, session); winners.incrementAndGet(); }
                catch (ServiceException denied) { if (!Integer.valueOf(404).equals(denied.getCode())) throw denied; }
            }));
            for (Future<?> attempt : attempts) attempt.get(10, TimeUnit.SECONDS);
            check(winners.get() == 1, "concurrent consumers have exactly one winner in Redis double");
        } finally { executor.shutdownNow(); executor.awaitTermination(10, TimeUnit.SECONDS); }
        redis.unavailable = true; expect(503, () -> service.issue(IDENTITY, session, "TICKET", 1L, 2L));
        expect(503, () -> service.consume(shared.downloadTicket(), IDENTITY, session));
    }

    private static void reassignmentRace() throws Exception {
        CrmServiceTicket stale = new CrmServiceTicket(); stale.setTicketId(1L); stale.setOwnerId(1L); stale.setPortalContactId(34L);
        CrmServiceTicket locked = new CrmServiceTicket(); locked.setTicketId(1L); locked.setOwnerId(2L); locked.setPortalContactId(34L);
        CrmServiceTicketMapper mapper = (CrmServiceTicketMapper) Proxy.newProxyInstance(CrmServiceTicketMapper.class.getClassLoader(), new Class<?>[]{CrmServiceTicketMapper.class}, (proxy, method, values) -> switch (method.getName()) {
            case "lockById" -> locked;
            case "selectByIdWithDataScope" -> stale;
            default -> throw new AssertionError("Unexpected mapper operation " + method.getName());
        });
        CrmServiceTicketServiceImpl service = new CrmServiceTicketServiceImpl(null, null, null);
        Field mapperField = com.baomidou.mybatisplus.extension.service.impl.ServiceImpl.class.getDeclaredField("baseMapper"); mapperField.setAccessible(true); mapperField.set(service, mapper);
        UserContext.setUserId(1L); UserContext.setTenantId(100000L); UserContext.setDsType(0); TenantContext.setTenantId(100000L);
        try { expect(403, () -> service.respondTicket(1L)); expect(403, () -> service.resolveTicket(1L, "stale owner")); expect(403, () -> service.closeTicket(1L)); }
        finally { UserContext.clear(); TenantContext.clear(); }
    }

    @SuppressWarnings("unchecked")
    private static final class MemoryRedis extends StringRedisTemplate {
        final Map<String, String> values = new ConcurrentHashMap<>();
        boolean unavailable;
        @Override public ValueOperations<String, String> opsForValue() {
            return (ValueOperations<String, String>) Proxy.newProxyInstance(ValueOperations.class.getClassLoader(), new Class<?>[]{ValueOperations.class}, (proxy, method, arguments) -> {
                if (unavailable) throw new DataAccessResourceFailureException("isolated Redis unavailable");
                if (method.getName().equals("get")) return values.get(arguments[0]);
                if (method.getName().equals("setIfAbsent")) {
                    check(Duration.ofSeconds(60).equals(arguments[2]), "download expiry remains exactly 60 seconds");
                    return values.putIfAbsent((String) arguments[0], (String) arguments[1]) == null;
                }
                throw new AssertionError("Unexpected Redis operation " + method.getName());
            });
        }
        @Override public <Result> Result execute(RedisScript<Result> script, List<String> keys, Object... arguments) {
            if (unavailable) throw new DataAccessResourceFailureException("isolated Redis unavailable");
            return script.getResultType().cast(values.remove(keys.get(0), arguments[0]) ? 1L : 0L);
        }
    }

    private static void unknown(ObjectMapper json, String value, Class<?> type) throws Exception {
        try { json.readValue(value, type); } catch (com.fasterxml.jackson.databind.JsonMappingException rejected) { checks++; return; }
        throw new AssertionError("Unknown property accepted by " + type.getSimpleName());
    }
    private static void expect(int code, Runnable action) {
        try { action.run(); } catch (ServiceException rejected) { check(Integer.valueOf(code).equals(rejected.getCode()), "expected rejection code " + code); return; }
        throw new AssertionError("Operation should have failed with " + code);
    }
    private static void check(boolean accepted, String label) { if (!accepted) throw new AssertionError(label); checks++; }
}
