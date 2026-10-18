package com.cloudflow.auth.message;

import java.io.IOException;
import java.net.IDN;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.SocketAddress;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;
import javax.net.SocketFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class SmtpEndpointPolicy {
    private final Set<String> hosts;
    private final Set<String> addresses;
    private final Set<Integer> ports;

    public SmtpEndpointPolicy(@Value("${cloudflow.message.smtp.allowed-hosts:}") String hosts,
            @Value("${cloudflow.message.smtp.allowed-addresses:}") String addresses,
            @Value("${cloudflow.message.smtp.extra-tls-ports:}") String extraPorts) {
        this.hosts = values(hosts).stream().map(SmtpEndpointPolicy::host).collect(Collectors.toUnmodifiableSet());
        this.addresses = Set.copyOf(values(addresses));
        HashSet<Integer> allowedPorts = new java.util.HashSet<>(Set.of(465, 587));
        for (String port : values(extraPorts)) {
            int parsed = Integer.parseInt(port);
            if (parsed < 1 || parsed > 65535) throw new IllegalArgumentException("SMTP端口白名单无效");
            allowedPorts.add(parsed);
        }
        ports = Set.copyOf(allowedPorts);
    }

    public Endpoint verify(String configuredHost, Integer port) {
        String target = host(configuredHost);
        if (!hosts.contains(target) || port == null || !ports.contains(port) || addresses.isEmpty()) {
            throw new IllegalArgumentException("SMTP_ENDPOINT_NOT_ALLOWED");
        }
        try {
            InetAddress[] resolved = InetAddress.getAllByName(target);
            if (resolved.length == 0 || Arrays.stream(resolved).anyMatch(address -> !addresses.contains(address.getHostAddress()))) {
                throw new IllegalArgumentException("SMTP_ADDRESS_NOT_ALLOWED");
            }
            return new Endpoint(target, port, resolved[0]);
        } catch (IOException failure) {
            throw new IllegalArgumentException("SMTP_DNS_UNAVAILABLE");
        }
    }

    private static List<String> values(String input) {
        return input == null ? List.of() : Arrays.stream(input.split(",")).map(String::trim).filter(value -> !value.isEmpty()).toList();
    }

    private static String host(String value) {
        if (value == null || value.isBlank() || value.length() > 253 || value.chars().anyMatch(character -> character <= 32 || character == 127)
                || value.contains(":") || value.contains("/") || value.contains("@") || value.endsWith(".")) {
            throw new IllegalArgumentException("SMTP_HOST_INVALID");
        }
        return IDN.toASCII(value, IDN.USE_STD3_ASCII_RULES).toLowerCase(Locale.ROOT);
    }

    public record Endpoint(String host, int port, InetAddress address) {
        public SocketFactory socketFactory() {
            return new SocketFactory() {
                @Override
                public Socket createSocket() {
                    return new Socket() {
                        @Override
                        public void connect(SocketAddress endpoint, int timeout) throws IOException {
                            if (!(endpoint instanceof InetSocketAddress target) || target.getPort() != port) {
                                throw new IOException("SMTP_ENDPOINT_CHANGED");
                            }
                            super.connect(new InetSocketAddress(address, port), timeout);
                        }

                        @Override
                        public void connect(SocketAddress endpoint) throws IOException { connect(endpoint, 5000); }
                    };
                }

                private Socket connectTarget(int requestedPort) throws IOException {
                    if (requestedPort != port) throw new IOException("SMTP_ENDPOINT_CHANGED");
                    Socket socket = createSocket();
                    socket.connect(new InetSocketAddress(address, port), 5000);
                    return socket;
                }

                @Override
                public Socket createSocket(String requestedHost, int requestedPort) throws IOException { return connectTarget(requestedPort); }
                @Override
                public Socket createSocket(InetAddress requestedHost, int requestedPort) throws IOException { return connectTarget(requestedPort); }
                @Override
                public Socket createSocket(String requestedHost, int requestedPort, InetAddress localHost, int localPort) throws IOException {
                    return connectTarget(requestedPort);
                }
                @Override
                public Socket createSocket(InetAddress requestedHost, int requestedPort, InetAddress localHost, int localPort) throws IOException {
                    return connectTarget(requestedPort);
                }
            };
        }
    }
}
