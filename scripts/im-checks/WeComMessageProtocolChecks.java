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
import java.util.List;
import java.util.Objects;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.transaction.support.TransactionSynchronizationManager;

public final class WeComMessageProtocolChecks {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static int assertions;

    public static void main(String[] arguments) throws Exception {
        content();
        transport();
        System.out.println("G4_WECOM_MESSAGE_PROTOCOL: assertions=" + assertions
                + "; failed=0; real_loopback_http=true; actual_sdk=4.8.6.B; text_and_template_card=true; vendor_service=false; database=false; redis=false");
    }

    private static void content() throws Exception {
        WeComCredentials credentials = credentials();
        ImMessageSender.Notice notice = new ImMessageSender.Notice("Member.One", "通知标题", "完整内容", null);
        JsonNode text = JSON.readTree(ImMessageContent.body(credentials, notice));
        equal("text", text.path("msgtype").textValue(), "plain messages use text");
        equal("通知标题\n完整内容", text.path("text").path("content").textValue(), "title and content retained");
        equal(1, text.path("safe").intValue(), "text content uses confidential mode");
        equal(0, text.path("enable_id_trans").intValue(), "member translation disabled");
        check(!text.has("toparty") && !text.has("totag"), "no broadcast lists");
        check(!notice.toString().contains("Member.One") && !notice.toString().contains("完整内容"), "notice string is redacted");
        ImMessageContent.body(credentials, new ImMessageSender.Notice("member", null, "a".repeat(2048), null));
        rejected(() -> ImMessageContent.body(credentials, new ImMessageSender.Notice("member", null, "a".repeat(2049), null)));
        ImMessageContent.body(credentials, new ImMessageSender.Notice("member", null, "中".repeat(682), null));
        rejected(() -> ImMessageContent.body(credentials, new ImMessageSender.Notice("member", null, "中".repeat(683), null)));
        for (String member : List.of("@all", "@ALL", "member|other", "member\nother", " member")) {
            rejected(() -> ImMessageContent.body(credentials, new ImMessageSender.Notice(member, "title", "body", null)));
        }
        for (String bad : List.of("", "  ", "body\u0000")) {
            rejected(() -> ImMessageContent.body(credentials, new ImMessageSender.Notice("member", "title", bad, null)));
        }
        equal("https://cloudflow.example.test/workflow/tasks?taskId=7", ImMessageContent.destination("https://cloudflow.example.test/",
                "/workflow/tasks?taskId=7"), "local detail URL resolved without changing query");
        for (String bad : List.of("//evil.test/task", "https://evil.test/task", "https://cloudflow.example.test.evil.test/task",
                "https://user@cloudflow.example.test/task", "http://cloudflow.example.test/task", "javascript:alert(1)",
                "/api/auth/me", "/auth/im/WECOM/callback", "/login", "/register", "/workflow/../login",
                "/%61pi/auth", "/workflow\\tasks", "/workflow/tasks#fragment", "/workflow/tasks\n")) {
            rejected(() -> ImMessageContent.destination("https://cloudflow.example.test", bad));
        }
        rejected(() -> ImMessageContent.destination(null, "/workflow/tasks"));
        equal(null, ImMessageContent.destination(null, null), "plain text does not require public URL");
        String title = "😀".repeat(40);
        JsonNode card = JSON.readTree(ImMessageContent.body(credentials, new ImMessageSender.Notice("member", title,
                "中".repeat(170), "https://cloudflow.example.test/workflow/tasks?taskId=7")));
        equal("template_card", card.path("msgtype").textValue(), "linked message uses template card");
        equal("text_notice", card.path("template_card").path("card_type").textValue(), "notice card format");
        String preview = card.path("template_card").path("main_title").path("title").textValue();
        equal(36, preview.codePointCount(0, preview.length()), "emoji summary preserves code points");
        check(preview.endsWith("…"), "shortened title is explicit");
        equal(160, card.path("template_card").path("sub_title_text").textValue().length(), "card summary length");
        check(!card.path("template_card").has("button_list") && !card.path("template_card").has("action_menu"), "generic notice cannot approve workflow");
        ImProperties disabled = new ImProperties();
        outcome("SKIPPED", new WeComMessageSender(disabled, null).send(credentials, notice), "disabled deployment does not contact vendor");
    }

    private static void transport() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        ExecutorService workers = Executors.newFixedThreadPool(2);
        server.setExecutor(workers);
        AtomicReference<String> response = new AtomicReference<>("{\"errcode\":0,\"msgid\":\"message-accepted-1\"}");
        AtomicInteger status = new AtomicInteger(200);
        AtomicInteger delay = new AtomicInteger();
        AtomicInteger invalidated = new AtomicInteger();
        List<String> bodies = new CopyOnWriteArrayList<>();
        server.createContext("/", exchange -> serve(exchange, response.get(), status.get(), delay.get(), bodies));
        server.start();
        try {
            WeComHttp http = new WeComHttp(WeComHttp.directClient(), official -> URI.create("http://127.0.0.1:" + server.getAddress().getPort()
                    + official.getRawPath() + "?" + official.getRawQuery()), Duration.ofMillis(600));
            WeComSdk sdk = new WeComSdk(credentials(), http, () -> "message-private-access-token", ignored -> invalidated.incrementAndGet());
            ImMessageSender.Notice notice = new ImMessageSender.Notice("Member.One", "标题", "message-private-content", null);
            ChannelSendResult accepted = WeComMessageSender.send(sdk, credentials(), notice);
            outcome("SENT", accepted, "explicit acceptance");
            equal("message-accepted-1", accepted.getProviderMessageId(), "remote identity retained");
            equal(1, bodies.size(), "one acceptance uses one request");
            equal("Member.One", JSON.readTree(bodies.get(0)).path("touser").textValue(), "single precise mapped recipient");
            ImMessageSender.Notice card = new ImMessageSender.Notice("Member.One", "标题", "摘要", "https://cloudflow.example.test/workflow/tasks");
            outcome("SENT", WeComMessageSender.send(sdk, credentials(), card), "template card actual protocol accepted");
            equal("template_card", JSON.readTree(bodies.get(1)).path("msgtype").textValue(), "actual template card payload");
            for (String field : List.of("invaliduser", "unlicenseduser")) {
                response.set("{\"errcode\":0,\"msgid\":\"message-id\",\"" + field + "\":\"member.one\"}");
                ChannelSendResult rejected = WeComMessageSender.send(sdk, credentials(), notice);
                outcome("FAILED", rejected, "lowercase recipient refusal is not success");
                equal("IM_MESSAGE_RECIPIENT_REJECTED", rejected.getErrorMessage(), "recipient rejection reason");
            }
            for (String body : List.of("{}", "{\"errcode\":0}", "{\"errcode\":0,\"msgid\":3}",
                    "{\"errcode\":0,\"msgid\":\"\"}", "{\"errcode\":0,\"msgid\":\"has space\"}",
                    "{\"errcode\":0,\"msgid\":\"" + "m".repeat(256) + "\"}",
                    "{\"errcode\":0,\"msgid\":\"message\",\"invaliduser\":[]}",
                    "{\"errcode\":0,\"msgid\":\"message\",\"invaliduser\":\"another-member\"}",
                    "{\"errcode\":0,\"msgid\":\"message\",\"invalidparty\":\"1\"}",
                    "{\"errcode\":0,\"errcode\":0,\"msgid\":\"message\"}", "[]", "not-json")) {
                response.set(body);
                int before = bodies.size();
                outcome("UNKNOWN", WeComMessageSender.send(sdk, credentials(), notice), "malformed acceptance remains uncertain");
                equal(before + 1, bodies.size(), "uncertain response never retried inside sender");
            }
            for (int code : List.of(-1, 45009, 40014, 42001, 40001)) {
                response.set("{\"errcode\":" + code + "}");
                int before = bodies.size();
                outcome("RETRYABLE", WeComMessageSender.send(sdk, credentials(), notice), "explicit temporary refusal permits durable retry");
                equal(before + 1, bodies.size(), "SDK immediate retries disabled");
            }
            equal(3, invalidated.get(), "only rejected tokens discarded");
            response.set("{\"errcode\":81013}");
            outcome("FAILED", WeComMessageSender.send(sdk, credentials(), notice), "all recipients invalid is permanent failure");
            response.set("{\"errcode\":0,\"msgid\":\"message\"}");
            status.set(503);
            outcome("UNKNOWN", WeComMessageSender.send(sdk, credentials(), notice), "HTTP error after send remains uncertain");
            status.set(302);
            int beforeRedirect = bodies.size();
            outcome("UNKNOWN", WeComMessageSender.send(sdk, credentials(), notice), "redirect rejected");
            equal(beforeRedirect + 1, bodies.size(), "redirect destination never called");
            status.set(200);
            delay.set(900);
            outcome("UNKNOWN", WeComMessageSender.send(sdk, credentials(), notice), "write timeout remains uncertain");
            delay.set(0);
            int beforeInvalid = bodies.size();
            outcome("FAILED", WeComMessageSender.send(sdk, credentials(), new ImMessageSender.Notice("@all", "title", "body", null)), "broadcast cannot reach transport");
            equal(beforeInvalid, bodies.size(), "invalid payload causes no remote request");
            TransactionSynchronizationManager.setActualTransactionActive(true);
            try {
                boolean refused = false;
                try { WeComMessageSender.send(sdk, credentials(), notice); } catch (IllegalStateException failure) { refused = true; }
                check(refused, "external send inside transaction rejected");
            } finally { TransactionSynchronizationManager.setActualTransactionActive(false); }
            equal(beforeInvalid, bodies.size(), "transaction boundary causes no remote request");
        } finally { server.stop(0); workers.shutdownNow(); }
    }

    private static void serve(HttpExchange exchange, String body, int status, int delay, List<String> bodies) throws IOException {
        bodies.add(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
        try {
            if (delay > 0) Thread.sleep(delay);
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Location", "/unexpected");
            exchange.sendResponseHeaders(status, bytes.length);
            exchange.getResponseBody().write(bytes);
        } catch (InterruptedException failure) { Thread.currentThread().interrupt(); }
        catch (IOException failure) { if (delay == 0) throw failure; }
        finally { exchange.close(); }
    }

    private static WeComCredentials credentials() { return new WeComCredentials(100000, 120, 3, "test-corp", 100001, "test-app-secret", null, null); }
    private static void rejected(Runnable operation) {
        try { operation.run(); throw new AssertionError("invalid message content accepted"); }
        catch (ImFailure expected) { assertions++; }
    }
    private static void outcome(String expected, ChannelSendResult actual, String description) {
        equal(expected, actual.getOutcome(), description);
        check(actual.isSuccess() == "SENT".equals(expected) && actual.isImplemented(), "outcome flags consistent");
    }
    private static void equal(Object expected, Object actual, String description) { check(Objects.equals(expected, actual), description); }
    private static void check(boolean condition, String description) { if (!condition) throw new AssertionError(description); assertions++; }
}
