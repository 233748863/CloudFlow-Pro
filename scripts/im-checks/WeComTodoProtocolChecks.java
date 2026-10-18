package com.cloudflow.auth.im;

import com.cloudflow.common.message.channel.ChannelSendResult;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.transaction.support.TransactionSynchronizationManager;

public final class WeComTodoProtocolChecks {
    private static final ObjectMapper JSON = new ObjectMapper().findAndRegisterModules();
    private static final String ORIGIN = "https://cloudflow.example.test";
    private static final String RECEIPT = "private-im-response-code-never-log";
    private static int assertions;

    public static void main(String[] arguments) throws Exception {
        content();
        transport();
        System.out.println("G4_WECOM_TODO_PROTOCOL: assertions=" + assertions + "; failed=0; real_loopback_http=true; actual_sdk=4.8.6.B; vendor_service=false; actual_task_projection=false; durable_delivery=false");
    }

    private static void content() throws Exception {
        ImTodoProvider.Card card = card(true);
        JsonNode root = JSON.readTree(ImTodoContent.send(credentials(), card, ORIGIN));
        check("Member.One".equals(root.path("touser").asText()) && !root.has("toparty") && !root.has("totag"), "single recipient without broadcasts");
        JsonNode template = root.path("template_card");
        check("button_interaction".equals(template.path("card_type").asText()), "approval template card");
        check(template.path("task_id").asText().equals(card.cardKey()), "random card key is vendor task identity");
        check(template.path("button_list").size() == 3 && "APPROVE".equals(template.path("button_list").get(0).path("key").asText())
                && "REJECT".equals(template.path("button_list").get(1).path("key").asText()), "explicit approval actions and details");
        check(root.path("enable_id_trans").asInt() == 0, "no vendor member interpolation");
        JsonNode detail = JSON.readTree(ImTodoContent.send(credentials(), card(false), ORIGIN)).path("template_card").path("button_list");
        check(detail.size() == 1 && detail.get(0).path("type").asInt() == 1 && !detail.get(0).has("key"), "complex task has only detail action");
        check(!card.toString().contains("Member.One") && !JSON.writeValueAsString(card).contains("Member.One"), "card diagnostics and JSON hide private fields");
        for (String target : List.of("@all", "member|other", "member\nother")) {
            reject(() -> ImTodoContent.send(credentials(), new ImTodoProvider.Card(target, card.cardKey(), "标题", "发起人", List.of(), card.detailUrl(), true), ORIGIN));
        }
        reject(() -> ImTodoContent.send(credentials(), new ImTodoProvider.Card(card.member(), card.cardKey(), "标题", "发起人", java.util.Collections.nCopies(6, new ImTodoProvider.Field("字段", "值")), card.detailUrl(), true), ORIGIN));
        reject(() -> ImTodoContent.send(credentials(), new ImTodoProvider.Card(card.member(), card.cardKey(), "标题", "发起人", List.of(), "https://other.example.test/task", true), ORIGIN));
        reject(() -> ImTodoContent.terminal(credentials(), completion(Instant.now().minusSeconds(1)), Instant.now()));
        JsonNode completed = JSON.readTree(ImTodoContent.terminal(credentials(), completion(Instant.now().plusSeconds(60)), Instant.now()));
        check(completed.path("userids").size() == 1 && completed.path("response_code").asText().equals(RECEIPT)
                && !completed.has("atall") && !completed.has("msgid"), "terminal update consumes receipt for exact recipient");
        check(!completion(Instant.now()).toString().contains(RECEIPT) && !JSON.writeValueAsString(completion(Instant.now())).contains(RECEIPT), "completion secrets hidden");
        check("SKIPPED".equals(new WeComTodoProvider(new ImProperties(), null).send(credentials(), card).getOutcome()), "default deployment performs no vendor operation");
    }

    private static void transport() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        ExecutorService workers = Executors.newFixedThreadPool(2);
        server.setExecutor(workers);
        AtomicReference<String> response = new AtomicReference<>("{\"errcode\":0,\"msgid\":\"card-one\",\"response_code\":\"" + RECEIPT + "\"}");
        AtomicInteger status = new AtomicInteger(200);
        AtomicInteger delay = new AtomicInteger();
        List<String> paths = new CopyOnWriteArrayList<>();
        server.createContext("/", exchange -> serve(exchange, response.get(), status.get(), delay.get(), paths));
        server.start();
        try {
            WeComHttp http = new WeComHttp(WeComHttp.directClient(), official -> URI.create("http://127.0.0.1:" + server.getAddress().getPort()
                    + official.getRawPath() + "?" + official.getRawQuery()), Duration.ofMillis(500));
            WeComSdk sdk = new WeComSdk(credentials(), http, () -> "private-card-access-token", ignored -> { });
            Instant before = Instant.now();
            ChannelSendResult sent = WeComTodoProvider.send(sdk, credentials(), card(true), ORIGIN);
            check("SENT".equals(sent.getOutcome()) && "card-one".equals(sent.getProviderMessageId()), "actual send protocol accepts card");
            check(RECEIPT.equals(sent.getPrivateReceipt().get("responseCode")), "update code retained only in private receipt");
            Instant expiry = Instant.parse(sent.getPrivateReceipt().get("expiresAt"));
            check(!expiry.isBefore(before.plus(Duration.ofHours(72))) && !expiry.isAfter(Instant.now().plus(Duration.ofHours(72))), "expiry follows official 72-hour validity");
            check(!JSON.writeValueAsString(sent).contains(RECEIPT) && !sent.toString().contains(RECEIPT), "sender result does not serialize update secret");
            for (String body : List.of("{\"errcode\":0,\"msgid\":\"card-one\"}", "{\"errcode\":0,\"msgid\":\"card-one\",\"response_code\":3}",
                    "{\"errcode\":0,\"errcode\":0}", "[]", "not-json")) {
                response.set(body);
                int count = paths.size();
                check("UNKNOWN".equals(WeComTodoProvider.send(sdk, credentials(), card(true), ORIGIN).getOutcome()), "malformed or missing receipt stays uncertain");
                check(paths.size() == count + 1, "uncertain write is not retried by SDK");
            }
            response.set("{\"errcode\":0}");
            ImTodoProvider.Completion completion = completion(Instant.now().plusSeconds(60));
            check("SENT".equals(WeComTodoProvider.terminal(sdk, credentials(), completion).getOutcome()), "terminal button update accepted");
            check(paths.get(paths.size() - 1).equals("/cgi-bin/message/update_template_card"), "official terminal update endpoint");
            response.set("{\"errcode\":0,\"invaliduser\":[\"member.one\"]}");
            check("FAILED".equals(WeComTodoProvider.terminal(sdk, credentials(), completion).getOutcome()), "invalid exact recipient cannot count as updated");
            response.set("{\"errcode\":0,\"invaliduser\":\"member.one\"}");
            check("UNKNOWN".equals(WeComTodoProvider.terminal(sdk, credentials(), completion).getOutcome()), "malformed update refusal remains unknown");
            for (int code : List.of(-1, 45009, 40014)) {
                response.set("{\"errcode\":" + code + "}");
                check("RETRYABLE".equals(WeComTodoProvider.send(sdk, credentials(), card(true), ORIGIN).getOutcome()), "explicit temporary refusal permits queued retry");
            }
            response.set("{\"errcode\":0}"); status.set(503);
            check("UNKNOWN".equals(WeComTodoProvider.terminal(sdk, credentials(), completion).getOutcome()), "HTTP failure cannot prove update rejection");
            status.set(302);
            int redirected = paths.size();
            check("UNKNOWN".equals(WeComTodoProvider.terminal(sdk, credentials(), completion).getOutcome()) && paths.size() == redirected + 1, "redirect is never followed");
            status.set(200); delay.set(800);
            check("UNKNOWN".equals(WeComTodoProvider.terminal(sdk, credentials(), completion).getOutcome()), "one-use update timeout cannot be called success");
            delay.set(0);
            int expired = paths.size();
            check("SKIPPED".equals(WeComTodoProvider.terminal(sdk, credentials(), completion(Instant.now().minusSeconds(1))).getOutcome()) && paths.size() == expired, "expired receipt makes no external request");
            TransactionSynchronizationManager.setActualTransactionActive(true);
            try { reject(() -> WeComTodoProvider.send(sdk, credentials(), card(true), ORIGIN)); }
            finally { TransactionSynchronizationManager.setActualTransactionActive(false); }
            check(paths.size() == expired, "transaction guard precedes external operation");
        } finally { server.stop(0); workers.shutdownNow(); if (!workers.awaitTermination(5, TimeUnit.SECONDS)) throw new AssertionError("Card fixture workers did not stop"); }
    }

    private static void serve(HttpExchange exchange, String response, int status, int delay, List<String> paths) throws IOException {
        paths.add(exchange.getRequestURI().getPath());
        exchange.getRequestBody().readAllBytes();
        try {
            if (delay > 0) Thread.sleep(delay);
            if (status == 302) exchange.getResponseHeaders().add("Location", "https://other.example.test/redirect");
            byte[] bytes = response.getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(status, bytes.length); exchange.getResponseBody().write(bytes);
        } catch (InterruptedException failure) { Thread.currentThread().interrupt(); }
        finally { exchange.close(); }
    }

    private static ImTodoProvider.Card card(boolean direct) { return new ImTodoProvider.Card("Member.One", "c".repeat(43), "流程标题", "发起人", List.of(new ImTodoProvider.Field("日期", "2026-09-30")), "/workflow/tasks?taskId=7", direct); }
    private static ImTodoProvider.Completion completion(Instant expiry) { return new ImTodoProvider.Completion("Member.One", RECEIPT, expiry, "COMPLETED"); }
    private static WeComCredentials credentials() { return new WeComCredentials(100000L, 100L, 0, "card-corp", 100001, "card-secret-private", null, null); }
    private static void check(boolean condition, String message) { assertions++; if (!condition) throw new AssertionError(message); }
    private static void reject(Runnable action) { boolean refused = false; try { action.run(); } catch (RuntimeException expected) { refused = true; } check(refused, "invalid card operation rejected"); }
}
