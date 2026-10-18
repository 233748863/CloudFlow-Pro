package com.cloudflow.crm.service.email;

import com.cloudflow.common.message.api.MessageEmailTemplate;
import com.cloudflow.common.message.security.MessageHtmlContent;
import com.cloudflow.common.message.security.MessagePayloadCodec;
import com.cloudflow.common.message.security.MessageSecretCipher;
import com.cloudflow.common.message.api.MessageDeliveryResult;
import com.cloudflow.crm.domain.CrmMassEmailRecipient;
import com.cloudflow.crm.domain.dto.CrmMassEmailCommand;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.net.IDN;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Consumer;

public final class CrmEmailFoundationChecks {
    private static int checks;

    public static void main(String[] arguments) throws Exception {
        addresses();
        tokens();
        links();
        configuration();
        snapshots();
        serialization();
        projections();
        html();
        System.out.println("PASS: E5 email foundation checks=" + checks + "; database=false; external_requests=0");
    }

    private static void addresses() {
        equal("Sales.Tag+offer@example.com", CrmEmailSecurity.address(" Sales.Tag+offer@EXAMPLE.COM "), "preserve local-part semantics");
        equal("Mail@" + IDN.toASCII("例子.公司"), CrmEmailSecurity.address("Mail@例子.公司"), "IDNA domain normalization");
        equal("S***@example.com", CrmEmailSecurity.maskAddress("Sales@Example.com"), "masked address");
        equal("S***@***", CrmEmailSecurity.maskAddress("Sales@" + "a".repeat(63) + "." + "b".repeat(63) + ".com"), "long domain masked within approved log limit");
        equal(100, CrmEmailSecurity.maskAddress("Sales@" + "a".repeat(63) + "." + "b".repeat(27) + ".com").length(), "maximum visible domain mask fits 100 characters");
        check(!CrmEmailSecurity.emailHash("Sales@example.com").equals(CrmEmailSecurity.emailHash("sales@example.com")), "distinct local parts not merged");
        equal(CrmEmailSecurity.emailHash("Sales@EXAMPLE.COM"), CrmEmailSecurity.emailHash(" Sales@example.com "), "domain and edge spaces canonical");
        for (String value : List.of("", "a", "@example.com", "a@@example.com", "a@example", "a..b@example.com", ".a@example.com",
                "a.@example.com", "a\r\nb@example.com", "a@example.com,b@example.com", "Display <a@example.com>", "a@example.com;", "a@example.com.",
                "a@-example.com", "a@exa_mple.com", "a\u007f@example.com", "a b@example.com", "a".repeat(65) + "@example.com", "甲@example.com")) {
            rejects(() -> CrmEmailSecurity.address(value), "invalid address rejected");
        }
        rejects(() -> CrmEmailSecurity.address(null), "null address rejected");
    }

    private static void tokens() {
        Set<String> generated = new HashSet<>();
        for (int index = 0; index < 128; index++) {
            String token = CrmEmailSecurity.newToken();
            equal(43, token.length(), "token length");
            equal(32, Base64.getUrlDecoder().decode(token).length, "256 random bits");
            equal(MessagePayloadCodec.hash(token), CrmEmailSecurity.tokenHash(token), "SHA256 token lookup");
            check(generated.add(token), "independent token generation");
        }
        for (String invalid : List.of("", "1", "A".repeat(42), "A".repeat(44), "A".repeat(42) + "=", "A".repeat(42) + "B",
                "A".repeat(42) + "/", "A".repeat(42) + "+", "A".repeat(42) + "\n")) rejects(() -> CrmEmailSecurity.tokenHash(invalid), "noncanonical token rejected");
        rejects(() -> CrmEmailSecurity.tokenHash(null), "null token rejected");
    }

    private static void links() {
        Set<String> hosts = Set.of("example.com", "news.example.com");
        equal("https://example.com/", CrmEmailSecurity.destination("HTTPS://EXAMPLE.COM:443", hosts), "canonical HTTPS target");
        equal("https://example.com/a?next=%2Fsafe#part", CrmEmailSecurity.destination("https://example.com/a?next=%2Fsafe#part", hosts), "target path preserved");
        for (String value : List.of("http://example.com/", "//example.com", "https://example.com.evil.com/", "https://other.example.com/",
                "https://user@example.com/", "https://example.com@evil.com/", "https://example.com:8443/", "https://example.com./",
                "https://127.0.0.1/", "https://[::1]/", "https://example.com/\\evil", "https://example.com/%0d%0aLocation:evil",
                "https://example.com/%250a", "https://example.com/%255c", "https://example.com/%1f", "https://example.com/%7f", "https://example.com/a b")) {
            rejects(() -> CrmEmailSecurity.destination(value, hosts), "unsafe or unapproved target rejected");
        }
        equal("https://example.com", CrmEmailSecurity.publicOrigin("https://example.com/"), "origin has no path");
        rejects(() -> CrmEmailSecurity.publicOrigin("https://example.com/path"), "origin path rejected");
        rejects(() -> CrmEmailSecurity.publicOrigin("https://example.com/?next=1"), "origin query rejected");
        rejects(() -> CrmEmailSecurity.publicOrigin("https://example.com/#fragment"), "origin fragment rejected");
        String token = CrmEmailSecurity.newToken();
        for (String purpose : List.of("open", "click", "unsubscribe")) equal("https://example.com/crm/track/" + purpose + "?token=" + token,
                CrmEmailSecurity.trackingUrl("https://example.com", purpose, token), "fixed public route");
        rejects(() -> CrmEmailSecurity.trackingUrl("https://example.com", "../admin", token), "invalid purpose rejected");
        rejects(() -> CrmEmailSecurity.destination("https://example.com/", Set.of()), "empty allowlist rejected");
    }

    private static void configuration() {
        CrmEmailPolicyService.Policy disabled = CrmEmailPolicyService.parse(Map.of());
        check(!disabled.sendingEnabled() && !disabled.trackingEnabled(), "missing configuration disabled");
        equal(5000, disabled.confirmationThreshold(), "confirmation default");
        rejects(disabled::requireSending, "missing configuration never sends");
        LinkedHashMap<String, String> settings = new LinkedHashMap<>(Map.of("crm.email.sendingEnabled", "true", "crm.email.trackingEnabled", "true",
                "crm.email.publicOrigin", "https://mail.example.com", "crm.email.allowedHosts", "example.com,news.example.com"));
        CrmEmailPolicyService.Policy enabled = CrmEmailPolicyService.parse(settings);
        check(enabled.sendingEnabled() && enabled.trackingEnabled(), "complete configuration enabled");
        equal(Set.of("example.com", "news.example.com"), enabled.allowedHosts(), "exact host allowlist");
        settings.put("crm.email.trackingEnabled", "false");
        CrmEmailPolicyService.Policy trackingOff = CrmEmailPolicyService.parse(settings);
        check(trackingOff.sendingEnabled() && !trackingOff.trackingEnabled(), "unsubscribe origin independent of observation switch");
        settings.put("crm.email.publicOrigin", "");
        check(!CrmEmailPolicyService.parse(settings).sendingEnabled(), "missing unsubscribe origin stops marketing");
        settings.put("crm.email.publicOrigin", "https://mail.example.com");
        for (String value : List.of("-1", "0", "abc", "2147483648")) {
            settings.put("crm.email.confirmationThreshold", value);
            check(!CrmEmailPolicyService.parse(settings).sendingEnabled(), "invalid threshold disabled");
        }
        settings.put("crm.email.confirmationThreshold", "1");
        equal(1, CrmEmailPolicyService.parse(settings).confirmationThreshold(), "explicit threshold");
        for (String value : List.of("*.example.com", "https://example.com", "example.com,", "localhost", "example.local", "example.com:443")) {
            settings.put("crm.email.allowedHosts", value);
            check(!CrmEmailPolicyService.parse(settings).sendingEnabled(), "malformed allowlist disabled");
        }
        rejects(() -> enabled.allowedHosts().add("evil.example.com"), "policy immutable");
    }

    private static void serialization() throws Exception {
        ObjectMapper json = new ObjectMapper().findAndRegisterModules().registerModule(new com.fasterxml.jackson.databind.module.SimpleModule("production-sensitive-module")
                .setSerializerModifier(new com.cloudflow.common.sensitive.config.SensitiveBeanSerializerModifier()));
        String address = "sender-one@example.com";
        MessageEmailTemplate template = new com.cloudflow.common.message.api.MessageEmailTemplate(100L, "E5_TEST", 0, "<p>内容</p>", "[]", address, "E5", true, null);
        check(!json.writeValueAsString(template).contains(address), "public template serialization masks the sender");
        JsonNode response = json.readTree(json.writeValueAsBytes(com.cloudflow.common.core.domain.R.ok(MessagePayloadCodec.internalTree(template, json))));
        MessageEmailTemplate received = json.treeToValue(response.path("data"), com.cloudflow.common.message.api.MessageEmailTemplate.class);
        equal(address, received.fromAddress(), "protected template transport preserves the actual sender");
        CrmEmailSnapshotService service = new CrmEmailSnapshotService(null, null, null, null, json);
        MessageEmailTemplate changed = new com.cloudflow.common.message.api.MessageEmailTemplate(100L, "E5_TEST", 0, "<p>内容</p>", "[]", "sender-two@example.com", "E5", true, null);
        check(!service.templateDigest(template).equals(service.templateDigest(changed)), "different senders with the same public mask have different template digests");
        ObjectNode input = json.createObjectNode().put("version", 0).put("testAddress", address);
        CrmMassEmailCommand command = json.treeToValue(input, com.cloudflow.crm.domain.dto.CrmMassEmailCommand.class);
        equal(address, command.testAddress(), "test command deserializes the write-only address");
        check(!json.writeValueAsString(command).contains(address) && !command.toString().contains(address), "test command does not serialize the mailbox into logs");
        check(!json.writeValueAsString(template).contains(address), "internal template serialization does not disable later public masking");
    }

    private static void snapshots() throws Exception {
        ObjectMapper json = new ObjectMapper();
        CrmEmailSnapshotCodec codec = new CrmEmailSnapshotCodec(new MessageSecretCipher("e5-ephemeral-test-key-at-least-32-characters"), json);
        CrmMassEmailRecipient recipient = recipient();
        String address = "Sales@example.com";
        recipient.setEmailEncrypted(codec.encode(recipient, "ADDRESS", json.valueToTree(address)));
        equal(address, codec.readAddress(recipient), "authenticated nonempty address round trip");
        check(!recipient.getEmailEncrypted().contains(address), "no plaintext address in cipher");
        check(recipient.getEmailEncrypted().length() <= 2000, "cipher fits approved address column");
        String token = CrmEmailSecurity.newToken();
        recipient.setOpenTokenHash(CrmEmailSecurity.tokenHash(token));
        String variables = codec.encode(recipient, "VARIABLES", json.valueToTree(Map.of("openToken", token, "contactName", "测试联系人")));
        recipient.setVariableSnapshotEncrypted(variables);
        equal(token, codec.decode(recipient, "VARIABLES", variables).path("openToken").asText(), "sensitive variable round trip");
        String response = json.writeValueAsString(recipient);
        for (String value : List.of(address, recipient.getEmailEncrypted(), recipient.getEmailHash(), recipient.getOpenTokenHash(), variables, token)) {
            check(!response.contains(value), "ordinary recipient response hides protected value");
            check(!recipient.toString().contains(value), "recipient toString hides protected value");
        }
        rejects(() -> codec.decode(recipient, "ADDRESS", variables), "cross-purpose ciphertext rejected");
        rejects(() -> new CrmEmailSnapshotCodec(new MessageSecretCipher("different-test-key-at-least-32-characters"), json).readAddress(recipient), "wrong master key rejected");
        rejects(() -> new CrmEmailSnapshotCodec(new MessageSecretCipher(""), json).readAddress(recipient), "missing key rejected");
        rejects(() -> new CrmEmailSnapshotCodec(new MessageSecretCipher(""), json).encode(recipient, "ADDRESS", json.valueToTree(address)), "missing encryption key rejected");
        byte[] changed = Base64.getDecoder().decode(recipient.getEmailEncrypted());
        changed[changed.length - 1] ^= 1;
        rejects(() -> codec.decode(recipient, "ADDRESS", Base64.getEncoder().encodeToString(changed)), "tampered cipher rejected");
        List<java.util.function.Consumer<CrmMassEmailRecipient>> changes = List.of(
                value -> value.setTenantId(100001L), value -> value.setRecipientId(102L), value -> value.setMassEmailId(103L),
                value -> value.setCampaignId(104L), value -> value.setTargetId(105L), value -> value.setTargetType("CONTACT"),
                value -> value.setEmailHash(MessagePayloadCodec.hash("another@example.com")), value -> value.setEmailMask("x***@example.com"),
                value -> value.setCrmEmailId(106L), value -> value.setTestFlag(1));
        for (Consumer<CrmMassEmailRecipient> change : changes) {
            CrmMassEmailRecipient other = recipient();
            other.setEmailEncrypted(recipient.getEmailEncrypted());
            change.accept(other);
            rejects(() -> codec.readAddress(other), "cross-identity snapshot rejected");
        }
        rejects(() -> codec.encode(recipient, "VARIABLES", json.valueToTree("x".repeat(262145))), "oversized snapshot rejected");
    }

    private static void projections() {
        ObjectMapper json = new ObjectMapper();
        CrmEmailSnapshotCodec codec = new CrmEmailSnapshotCodec(new MessageSecretCipher("e5-projection-key-at-least-32-characters"), json);
        CrmEmailSnapshotService service = new CrmEmailSnapshotService(null, null, codec, null, json);
        CrmMassEmailRecipient recipient = recipient();
        recipient.setEmailEncrypted(codec.encode(recipient, "ADDRESS", json.valueToTree("Sales@example.com")));
        ObjectNode snapshot = json.createObjectNode(); snapshot.putObject("request"); snapshot.put("taskVersion", 7);
        recipient.setVariableSnapshotEncrypted(codec.encode(recipient, "VARIABLES", snapshot));
        check(service.newerResult(recipient, result(20L, 30L, 0)), "initial authenticated projection accepted");
        service.projectResult(recipient, result(20L, 30L, 2));
        equal(7, service.document(recipient).path("taskVersion").asInt(), "result projection preserves frozen task version");
        check(!service.newerResult(recipient, result(20L, 30L, 2)), "equal callback version ignored");
        check(!service.newerResult(recipient, result(20L, 30L, 1)), "stale callback version ignored");
        check(service.newerResult(recipient, result(20L, 30L, 3)), "newer callback version accepted");
        check(service.newerResult(recipient, result(21L, 31L, 0)), "independently verified resend can start new version sequence");
        rejects(() -> service.newerResult(recipient, result(21L, 30L, 3)), "same record with different delivery rejected");
        rejects(() -> service.newerResult(recipient, result(20L, 30L, -1)), "negative callback version rejected");
        rejects(() -> service.newerResult(recipient, result(null, 30L, 3)), "missing delivery identifier rejected");
        rejects(() -> service.newerResult(recipient, result(20L, null, 3)), "missing record identifier rejected");
        rejects(() -> service.newerResult(recipient, result(20L, 30L, null)), "missing callback version rejected");
        snapshot.putObject("deliveryProjection").put("recordId", 30).put("deliveryId", 20).put("version", "2");
        recipient.setVariableSnapshotEncrypted(codec.encode(recipient, "VARIABLES", snapshot));
        rejects(() -> service.newerResult(recipient, result(20L, 30L, 3)), "noninteger saved projection rejected");
    }

    private static MessageDeliveryResult result(Long deliveryId, Long recordId, Integer version) {
        return new MessageDeliveryResult(deliveryId, recordId, 100000L, "e5-event", "EMAIL", "SENT", "CRM_MASS_EMAIL", "100", null, version);
    }

    private static CrmMassEmailRecipient recipient() {
        CrmMassEmailRecipient result = new CrmMassEmailRecipient();
        result.setTenantId(100000L); result.setRecipientId(100L); result.setMassEmailId(101L); result.setCampaignId(102L);
        result.setTargetType("LEAD"); result.setTargetId(103L); result.setTestFlag(0);
        result.setEmailHash(CrmEmailSecurity.emailHash("Sales@example.com")); result.setEmailMask("S***@example.com");
        return result;
    }

    private static void html() {
        String source = "<p onclick='bad()'>Hello &amp; hi</p><script>alert(1)</script><a href='https://example.com/a?a=1&amp;b=2'>go</a>"
                + "<img src='https://example.com/image.png' onerror='bad()'><a href='javascript:alert(1)'>bad</a>";
        List<String> links = new ArrayList<>();
        String cleaned = MessageHtmlContent.rewrite(source, value -> { links.add(value); return "https://mail.example.com/click"; }, value -> value);
        equal(List.of("https://example.com/a?a=1&b=2"), links, "HTML parser resolves escaped link attributes");
        check(cleaned.contains("https://mail.example.com/click"), "link rewritten through safe parser");
        for (String unsafe : List.of("onclick", "script", "alert", "onerror", "javascript")) check(!cleaned.contains(unsafe), "active HTML removed");
        equal(cleaned, MessageHtmlContent.clean(cleaned), "sender sanitization preserves rewritten content");
        rejects(() -> MessageHtmlContent.rewrite("<a href='https://evil.example.com/'>link</a>", value -> {
            return CrmEmailSecurity.destination(value, Set.of("example.com"));
        }, value -> value), "unapproved marketing target rejects entire rendering");
        equal("", MessageHtmlContent.clean(null), "null content safe");
    }

    private static void equal(Object expected, Object actual, String label) {
        check(Objects.equals(expected, actual), label);
    }

    private static void check(boolean condition, String label) {
        checks++;
        if (!condition) throw new AssertionError(label);
    }

    private static void rejects(Runnable action, String label) {
        try { action.run(); }
        catch (RuntimeException expected) { check(true, label); return; }
        throw new AssertionError(label);
    }
}
