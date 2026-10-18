package com.cloudflow.auth.message;

import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyStore;
import java.util.List;
import java.util.Properties;
import javax.net.ssl.KeyManagerFactory;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManagerFactory;

public final class CrmEmailSmtpFixture implements AutoCloseable {
    private final SSLContext original;
    private final MessageSmtpProtocolChecks.Provider provider;

    public CrmEmailSmtpFixture(Path path, String password) throws Exception {
        KeyStore store = KeyStore.getInstance("PKCS12");
        try (InputStream input = Files.newInputStream(path)) { store.load(input, password.toCharArray()); }
        KeyManagerFactory keys = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());
        keys.init(store, password.toCharArray());
        TrustManagerFactory trust = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm()); trust.init(store);
        SSLContext context = SSLContext.getInstance("TLS"); context.init(keys.getKeyManagers(), trust.getTrustManagers(), null);
        original = SSLContext.getDefault(); SSLContext.setDefault(context);
        provider = new MessageSmtpProtocolChecks.Provider(context);
    }

    public int port() { return provider.port(); }
    public int connections() { return provider.connections.get(); }
    public int count() { return provider.messages.size(); }
    public List<String> failures() { return List.copyOf(provider.failures); }
    public void mode(String value) {
        if (!List.of("ACCEPT", "PERMANENT", "TEMPORARY", "UNKNOWN").contains(value)) throw new IllegalArgumentException("INVALID_FIXTURE_MODE");
        provider.mode = value;
    }
    public MimeMessage message(int index) throws Exception {
        return new MimeMessage(Session.getInstance(new Properties()), new ByteArrayInputStream(provider.messages.get(index).getBytes(StandardCharsets.UTF_8)));
    }
    @Override public void close() throws Exception {
        try { provider.close(); } finally { SSLContext.setDefault(original); }
    }
}
