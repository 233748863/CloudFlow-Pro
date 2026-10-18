package com.cloudflow.auth.message;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.mail.Multipart;
import jakarta.mail.Part;
import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.KeyStore;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import javax.net.ssl.KeyManagerFactory;
import javax.net.ssl.SSLContext;

public final class MessageSmtpFixtureChecks {
    public static void main(String[] arguments) throws Exception {
        Path directory = Path.of(arguments[0]).toRealPath();
        if (!directory.toString().replace('\\', '/').contains("/.cloudflow-runtime/batch-g-integration/")
                || !directory.getFileName().toString().equals("smtp")) throw new IllegalArgumentException("OWNED_SMTP_DIRECTORY_REQUIRED");
        ObjectMapper json = new ObjectMapper();
        String password = Files.readString(directory.resolve("store-password.txt"), StandardCharsets.UTF_8).trim();
        KeyStore store = KeyStore.getInstance("PKCS12");
        try (InputStream input = Files.newInputStream(directory.resolve("tls.p12"))) { store.load(input, password.toCharArray()); }
        KeyManagerFactory keys = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());
        keys.init(store, password.toCharArray());
        SSLContext context = SSLContext.getInstance("TLS");
        context.init(keys.getKeyManagers(), null, null);
        int port = arguments.length > 1 ? Integer.parseInt(arguments[1]) : 0;
        int lifetimeSeconds = arguments.length > 2 ? Integer.parseInt(arguments[2]) : 3600;
        if (lifetimeSeconds < 1 || lifetimeSeconds > 14400) throw new IllegalArgumentException("ISOLATED_SMTP_LIFETIME_EXCEEDED");
        Instant deadline = Instant.now().plusSeconds(lifetimeSeconds);
        try (MessageSmtpProtocolChecks.Provider provider = new MessageSmtpProtocolChecks.Provider(context, false, port)) {
            while (!Files.exists(directory.resolve("stop")) && Instant.now().isBefore(deadline)) {
                Path control = directory.resolve("control.json");
                if (Files.exists(control)) {
                    try {
                        String mode = json.readTree(Files.readString(control)).path("mode").asText();
                        if (List.of("ACCEPT", "PERMANENT", "TEMPORARY", "UNKNOWN", "NO_STARTTLS").contains(mode)) provider.mode = mode;
                    } catch (java.io.IOException incompleteWrite) { }
                }
                List<Map<String, Object>> messages = new ArrayList<>();
                for (String raw : provider.messages) messages.add(message(raw));
                LinkedHashMap<String, Object> snapshot = new LinkedHashMap<String, Object>();
                snapshot.put("port", provider.port());
                snapshot.put("mode", provider.mode);
                snapshot.put("connections", provider.connections.get());
                snapshot.put("authenticated", provider.encryptedAuthentications.get());
                snapshot.put("messages", messages);
                snapshot.put("failures", List.copyOf(provider.failures));
                snapshot.put("loopback", true);
                Path temporary = directory.resolve("snapshot-next.json");
                Files.writeString(temporary, json.writeValueAsString(snapshot), StandardCharsets.UTF_8);
                publishSnapshot(temporary, directory.resolve("snapshot.json"));
                Thread.sleep(100);
            }
        }
    }

    private static void publishSnapshot(Path temporary, Path target) throws java.io.IOException, InterruptedException {
        for (int attempt = 0; ; attempt++) {
            try {
                Files.move(temporary, target, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
                return;
            } catch (java.nio.file.AccessDeniedException readerStillOpen) {
                if (attempt >= 39) throw readerStillOpen;
                Thread.sleep(25);
            }
        }
    }

    private static Map<String, Object> message(String raw) throws Exception {
        MimeMessage message = new MimeMessage(Session.getInstance(new Properties()), new ByteArrayInputStream(raw.getBytes(StandardCharsets.UTF_8)));
        LinkedHashMap<String, Object> result = new LinkedHashMap<String, Object>();
        result.put("subject", message.getSubject());
        result.put("messageId", message.getMessageID());
        result.put("to", java.util.Arrays.stream(message.getAllRecipients()).map(Object::toString).toList());
        result.put("cc", message.getHeader("Cc", null));
        result.put("bcc", message.getHeader("Bcc", null));
        List<String> bodies = new ArrayList<>();
        List<Map<String, Object>> attachments = new ArrayList<>();
        parts(message, bodies, attachments);
        result.put("body", String.join("\n", bodies));
        result.put("attachments", attachments);
        return result;
    }

    private static void parts(Part part, List<String> bodies, List<Map<String, Object>> attachments) throws Exception {
        if (part.isMimeType("multipart/*")) {
            Multipart contents = (Multipart) part.getContent();
            for (int index = 0; index < contents.getCount(); index++) parts(contents.getBodyPart(index), bodies, attachments);
        } else if (Part.ATTACHMENT.equalsIgnoreCase(part.getDisposition())) {
            byte[] bytes;
            try (InputStream stream = part.getInputStream()) { bytes = stream.readAllBytes(); }
            attachments.add(Map.of("name", part.getFileName(), "type", part.getContentType(), "size", bytes.length,
                    "sha256", java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(bytes))));
        } else if (part.isMimeType("text/*")) bodies.add(String.valueOf(part.getContent()));
    }
}
