package com.cloudflow.auth.message;

import com.cloudflow.auth.domain.SysMessageRecord;
import com.cloudflow.auth.mapper.SysMessageChannelMapper;
import com.cloudflow.auth.mapper.SysUserMapper;
import com.cloudflow.common.message.channel.ChannelTestContext;
import com.cloudflow.common.message.channel.MessageChannelSenderFactory;
import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyStore;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
import javax.net.ssl.KeyManagerFactory;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.TrustManagerFactory;

final class MessageSmtpProtocolChecks {
    static void run(MessageDeliveryDatabaseChecks suite, Path keyStorePath, String password) throws Exception {
        KeyStore store = KeyStore.getInstance("PKCS12");
        try (InputStream input = Files.newInputStream(keyStorePath)) { store.load(input, password.toCharArray()); }
        KeyManagerFactory keys = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());
        keys.init(store, password.toCharArray());
        TrustManagerFactory trust = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
        trust.init(store);
        SSLContext context = SSLContext.getInstance("TLS");
        context.init(keys.getKeyManagers(), trust.getTrustManagers(), null);
        SSLContext original = SSLContext.getDefault();
        SSLContext.setDefault(context);
        try (Provider provider = new Provider(context)) {
            String addresses = java.util.Arrays.stream(InetAddress.getAllByName("localhost")).map(InetAddress::getHostAddress)
                    .collect(java.util.stream.Collectors.joining(","));
            SmtpEndpointPolicy endpoints = new SmtpEndpointPolicy("localhost", addresses, String.valueOf(provider.port()));
            suite.jdbc.update("UPDATE sys_message_channel SET smtp_host='localhost',smtp_port=?,smtp_ssl_flag=0,smtp_username='fixture-user',smtp_pwd_cipher=?,from_address='sender@example.com',from_name='CloudFlow' WHERE channel_id=100",
                    provider.port(), suite.cipher.encrypt("fixture-password"));
            EmailChannelSender sender = new EmailChannelSender(suite.mapper(SysMessageChannelMapper.class), suite.mapper(SysUserMapper.class), suite.cipher, endpoints);
            MessageDeliveryService worker = suite.service(new MessageChannelSenderFactory(List.of(sender)));
            suite.check(sender.test(ChannelTestContext.builder().tenantId(suite.TENANT).channelId(100L).build()).isSuccess(), "real SMTP STARTTLS authentication connection test");
            suite.check(provider.messages.isEmpty(), "connection test sends no email");
            suite.check(provider.encryptedAuthentications.get() == 1, "SMTP connection test authenticates only after encryption");
            suite.jdbc.update("UPDATE sys_message_channel SET smtp_pwd_cipher=? WHERE channel_id=100", suite.cipher.encrypt("incorrect-fixture-password"));
            suite.check(!sender.test(ChannelTestContext.builder().tenantId(suite.TENANT).channelId(100L).build()).isSuccess(), "SMTP connection test rejects wrong credentials");
            SysMessageRecord badPassword = suite.reserve(suite.request("bad-password@example.com"));
            suite.check("FAILED".equals(worker.deliverRecord(suite.TENANT, badPassword.getRecordId()).getSendStatus()), "SMTP authentication rejection is a permanent failure");
            suite.check(provider.messages.isEmpty(), "authentication failure never submits mail content");
            suite.jdbc.update("UPDATE sys_message_channel SET smtp_pwd_cipher=? WHERE channel_id=100", suite.cipher.encrypt("fixture-password"));
            SysMessageRecord accepted = suite.reserve(suite.request("recipient@example.com").toBuilder()
                    .content("<p onclick='bad()'>安全正文<script>alert(1)</script><a href='https://example.com/detail'>查看</a><img src='javascript:bad()'></p>").build());
            suite.check("SUCCESS".equals(worker.deliverRecord(suite.TENANT, accepted.getRecordId()).getSendStatus()), "real SMTP accepts one message");
            String message = provider.messages.get(0);
            suite.check(message.contains("To: recipient@example.com") && !message.contains("\nCc:") && !message.contains("\nBcc:"), "one recipient and no cross-recipient headers");
            suite.check(message.contains("Message-ID: <cloudflow-100000-") && message.contains("@example.com>"), "stable delivery-based Message-ID");
            String html = MessageHtmlSanitizer.clean("<p onclick='bad()'>ok<script>alert(1)</script><a href='javascript:bad()'>bad</a></p>");
            suite.check(!html.contains("onclick") && !html.contains("script") && !html.contains("alert") && !html.contains("javascript"), "HTML active content removed");
            provider.mode = "TEMPORARY";
            SysMessageRecord temporary = suite.reserve(suite.request("temporary@example.com"));
            suite.check("RETRYABLE".equals(worker.deliverRecord(suite.TENANT, temporary.getRecordId()).getSendStatus()), "SMTP 450 known refusal permits retry");
            provider.mode = "PERMANENT";
            SysMessageRecord permanent = suite.reserve(suite.request("permanent@example.com"));
            suite.check("FAILED".equals(worker.deliverRecord(suite.TENANT, permanent.getRecordId()).getSendStatus()), "SMTP 550 known refusal fails permanently");
            provider.mode = "UNKNOWN";
            SysMessageRecord unknown = suite.reserve(suite.request("uncertain@example.com"));
            suite.check("UNKNOWN".equals(worker.deliverRecord(suite.TENANT, unknown.getRecordId()).getSendStatus()), "disconnect after DATA persists UNKNOWN");
            int connections = provider.connections.get();
            worker.deliverRecord(suite.TENANT, unknown.getRecordId());
            suite.check(provider.connections.get() == connections, "SMTP uncertain side effect not retried");
            provider.mode = "ACCEPT";
            SysMessageRecord injection = suite.reserve(suite.request("injection@example.com").toBuilder().title("subject\r\nBcc: stolen@example.com").build());
            suite.check("FAILED".equals(worker.deliverRecord(suite.TENANT, injection.getRecordId()).getSendStatus()), "SMTP header injection rejected");
            suite.check(provider.connections.get() == connections, "header injection causes no network connection");
            suite.rejects(() -> new SmtpEndpointPolicy("localhost", "192.0.2.99", String.valueOf(provider.port())).verify("localhost", provider.port()), "resolved target must match deployment IP allowlist");
            suite.rejects(() -> endpoints.verify("example.com", provider.port()), "unapproved SMTP host rejected");
            suite.rejects(() -> endpoints.verify("localhost", 25), "plaintext SMTP port not implicitly allowed");
            suite.jdbc.update("UPDATE sys_message_channel SET smtp_host='127.0.0.1' WHERE channel_id=100");
            EmailChannelSender mismatch = new EmailChannelSender(suite.mapper(SysMessageChannelMapper.class), suite.mapper(SysUserMapper.class), suite.cipher,
                    new SmtpEndpointPolicy("127.0.0.1", "127.0.0.1", String.valueOf(provider.port())));
            suite.check(!mismatch.test(ChannelTestContext.builder().tenantId(suite.TENANT).channelId(100L).build()).isSuccess(), "TLS certificate hostname mismatch rejected");
            suite.jdbc.update("UPDATE sys_message_channel SET smtp_host='localhost' WHERE channel_id=100");
            provider.mode = "NO_STARTTLS";
            suite.check(!sender.test(ChannelTestContext.builder().tenantId(suite.TENANT).channelId(100L).build()).isSuccess(), "missing STARTTLS cannot downgrade to plaintext");
            try (Provider implicit = new Provider(context, true)) {
                suite.jdbc.update("UPDATE sys_message_channel SET smtp_host='localhost',smtp_port=?,smtp_ssl_flag=1 WHERE channel_id=100", implicit.port());
                EmailChannelSender implicitSender = new EmailChannelSender(suite.mapper(SysMessageChannelMapper.class), suite.mapper(SysUserMapper.class), suite.cipher,
                        new SmtpEndpointPolicy("localhost", addresses, String.valueOf(implicit.port())));
                suite.check(implicitSender.test(ChannelTestContext.builder().tenantId(suite.TENANT).channelId(100L).build()).isSuccess(), "implicit TLS authenticates on an explicit isolated test port");
                SysMessageRecord implicitRecord = suite.reserve(suite.request("implicit-tls@example.com"));
                MessageDeliveryService implicitWorker = suite.service(new MessageChannelSenderFactory(List.of(implicitSender)));
                suite.check("SUCCESS".equals(implicitWorker.deliverRecord(suite.TENANT, implicitRecord.getRecordId()).getSendStatus()), "implicit TLS sender submits and records accepted email");
                suite.check(implicit.messages.size() == 1 && implicit.encryptedAuthentications.get() == 2, "implicit connection test plus delivery authenticate with no plaintext fallback");
                suite.jdbc.update("UPDATE sys_message_channel SET smtp_host='127.0.0.1' WHERE channel_id=100");
                EmailChannelSender implicitMismatch = new EmailChannelSender(suite.mapper(SysMessageChannelMapper.class), suite.mapper(SysUserMapper.class), suite.cipher,
                        new SmtpEndpointPolicy("127.0.0.1", "127.0.0.1", String.valueOf(implicit.port())));
                suite.check(!implicitMismatch.test(ChannelTestContext.builder().tenantId(suite.TENANT).channelId(100L).build()).isSuccess(), "implicit TLS also rejects wrong certificate hostname");
                suite.check(implicit.failures.isEmpty(), "implicit TLS protocol server has no unexpected failures");
            }
            suite.check(provider.failures.isEmpty(), "protocol server has no unexpected failures");
            System.out.println("MESSAGE_SMTP_PROTOCOL: starttls=true; implicit_tls=true; credentials_verified=true; certificate_identity=true; accept_reject_unknown=true; official_provider_contacted=false; interface_doubles=0");
        } finally { SSLContext.setDefault(original); }
    }

    static final class Provider implements AutoCloseable {
        final ServerSocket server;
        final SSLContext tls;
        final boolean implicit;
        final java.util.concurrent.ExecutorService executor = Executors.newCachedThreadPool();
        final List<String> messages = new CopyOnWriteArrayList<>();
        final List<String> failures = new CopyOnWriteArrayList<>();
        final AtomicInteger connections = new AtomicInteger();
        final AtomicInteger encryptedAuthentications = new AtomicInteger();
        volatile String mode = "ACCEPT";
        volatile boolean closed;

        Provider(SSLContext tls) throws Exception {
            this(tls, false);
        }

        Provider(SSLContext tls, boolean implicit) throws Exception {
            this(tls, implicit, 0);
        }

        Provider(SSLContext tls, boolean implicit, int port) throws Exception {
            this.tls = tls;
            this.implicit = implicit;
            if (port != 0 && (port <= 1024 || port > 65535)) throw new IllegalArgumentException("ISOLATED_SMTP_PORT_REQUIRED");
            server = new ServerSocket(port, 20, InetAddress.getByName("127.0.0.1"));
            executor.submit(() -> {
                while (!closed) {
                    try {
                        Socket socket = server.accept();
                        connections.incrementAndGet();
                        String scenario = mode;
                        executor.submit(() -> serve(socket, scenario));
                    } catch (java.io.IOException failure) { if (!closed) failures.add("ACCEPT_FAILED"); }
                }
            });
        }

        int port() { return server.getLocalPort(); }

        void serve(Socket raw, String scenario) {
            Socket socket = raw;
            try {
                socket.setSoTimeout(15000);
                if (implicit) socket = encrypt(socket);
                BufferedReader reader = reader(socket);
                BufferedWriter writer = writer(socket);
                reply(writer, "220 localhost ready");
                boolean encrypted = implicit;
                boolean authenticated = false;
                String line;
                while ((line = reader.readLine()) != null) {
                    if (line.startsWith("EHLO")) {
                        reply(writer, "250-localhost");
                        if (!encrypted && !"NO_STARTTLS".equals(scenario)) reply(writer, "250-STARTTLS");
                        reply(writer, "250 AUTH PLAIN LOGIN");
                    } else if (line.equals("STARTTLS")) {
                        reply(writer, "220 ready for TLS");
                        socket = encrypt(socket);
                        reader = reader(socket);
                        writer = writer(socket);
                        encrypted = true;
                    } else if (line.startsWith("AUTH PLAIN")) {
                        if (!encrypted) throw new IllegalStateException("PLAINTEXT_AUTH_ATTEMPT");
                        String credentials;
                        if (line.equals("AUTH PLAIN")) { reply(writer, "334 "); credentials = reader.readLine(); }
                        else credentials = line.substring("AUTH PLAIN ".length());
                        String plain = new String(java.util.Base64.getDecoder().decode(credentials), StandardCharsets.UTF_8);
                        authenticated = plain.equals("\u0000fixture-user\u0000fixture-password") || plain.equals("fixture-user\u0000fixture-user\u0000fixture-password");
                        if (authenticated) encryptedAuthentications.incrementAndGet();
                        reply(writer, authenticated ? "235 authenticated" : "535 invalid credentials");
                    } else if (line.startsWith("AUTH LOGIN")) {
                        if (!encrypted) throw new IllegalStateException("PLAINTEXT_AUTH_ATTEMPT");
                        String user;
                        if (line.equals("AUTH LOGIN")) { reply(writer, "334 VXNlcm5hbWU6"); user = reader.readLine(); }
                        else user = line.substring("AUTH LOGIN ".length());
                        reply(writer, "334 UGFzc3dvcmQ6");
                        String password = reader.readLine();
                        authenticated = decode(user).equals("fixture-user") && decode(password).equals("fixture-password");
                        if (authenticated) encryptedAuthentications.incrementAndGet();
                        reply(writer, authenticated ? "235 authenticated" : "535 invalid credentials");
                    } else if (line.startsWith("MAIL FROM:")) {
                        if (!encrypted || !authenticated) throw new IllegalStateException("UNAUTHENTICATED_MAIL_ATTEMPT");
                        reply(writer, "250 sender accepted");
                    } else if (line.startsWith("RCPT TO:")) {
                        reply(writer, "TEMPORARY".equals(scenario) ? "450 try later" : "PERMANENT".equals(scenario) ? "550 rejected" : "250 recipient accepted");
                    } else if (line.equals("DATA")) {
                        reply(writer, "354 content follows");
                        List<String> body = new ArrayList<>();
                        while ((line = reader.readLine()) != null && !line.equals(".")) body.add(line);
                        messages.add(String.join("\n", body));
                        if ("UNKNOWN".equals(scenario)) return;
                        reply(writer, "250 accepted");
                    } else if (line.equals("QUIT")) { reply(writer, "221 goodbye"); return; }
                    else if (line.equals("RSET") || line.equals("NOOP")) reply(writer, "250 ok");
                    else throw new IllegalStateException("UNEXPECTED_SMTP_COMMAND");
                }
            } catch (java.io.IOException expectedClientDisconnect) {
            } catch (Exception failure) { failures.add(failure.getClass().getSimpleName()); }
            finally { try { socket.close(); } catch (Exception ignored) { } }
        }

        Socket encrypt(Socket socket) throws Exception {
            SSLSocket secure = (SSLSocket) tls.getSocketFactory().createSocket(socket, "localhost", port(), true);
            secure.setUseClientMode(false);
            secure.startHandshake();
            return secure;
        }

        String decode(String value) { return new String(java.util.Base64.getDecoder().decode(value), StandardCharsets.UTF_8); }
        BufferedReader reader(Socket socket) throws Exception { return new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8)); }
        BufferedWriter writer(Socket socket) throws Exception { return new BufferedWriter(new OutputStreamWriter(socket.getOutputStream(), StandardCharsets.UTF_8)); }
        void reply(BufferedWriter writer, String text) throws Exception { writer.write(text); writer.write("\r\n"); writer.flush(); }
        public void close() throws Exception { closed = true; server.close(); executor.shutdownNow(); executor.awaitTermination(5, java.util.concurrent.TimeUnit.SECONDS); }
    }
}
