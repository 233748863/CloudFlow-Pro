package com.cloudflow.common.datasource.runtime;

import java.net.InetAddress;
import java.net.URI;
import java.net.UnknownHostException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Component
public class DataSourceNetworkPolicy {
    public static final Set<String> SERVICES = Set.of("cloudflow-auth", "cloudflow-service-hr",
            "cloudflow-service-oa", "cloudflow-service-crm", "cloudflow-service-workflow");
    private final DataSourceRuntimeProperties properties;
    private final Resolver resolver;

    @Autowired
    public DataSourceNetworkPolicy(DataSourceRuntimeProperties properties) {
        this(properties, InetAddress::getAllByName);
    }

    DataSourceNetworkPolicy(DataSourceRuntimeProperties properties, Resolver resolver) {
        this.properties = properties;
        this.resolver = resolver;
    }

    public Endpoint validate(String url, String username) {
        if (url == null || url.length() > 1000 || !url.startsWith("jdbc:mysql://")
                || !url.equals(url.trim()) || url.indexOf('%') >= 0 || url.indexOf('\\') >= 0
                || url.indexOf('?') >= 0 || url.indexOf('#') >= 0 || url.indexOf('@') >= 0
                || url.indexOf(',') >= 0 || url.chars().anyMatch(character -> character <= 32 || character >= 127)) {
            throw invalidUrl();
        }
        URI parsed;
        try { parsed = URI.create(url.substring(5)); }
        catch (IllegalArgumentException failure) { throw invalidUrl(); }
        String host = parsed.getHost();
        int port = parsed.getPort();
        String path = parsed.getRawPath();
        if (!"mysql".equals(parsed.getScheme()) || host == null || port < 1 || port > 65535
                || parsed.getRawUserInfo() != null || parsed.getRawQuery() != null || parsed.getRawFragment() != null
                || path == null || !path.matches("/[A-Za-z0-9_]{1,64}")) throw invalidUrl();
        host = host.toLowerCase(Locale.ROOT);
        if (host.startsWith("[")) host = host.substring(1, host.length() - 1);
        if (!validHost(host)) throw invalidUrl();
        String database = path.substring(1);
        List<DataSourceRuntimeProperties.Target> allowed = new ArrayList<>();
        if (properties.getTargets() != null) {
            for (DataSourceRuntimeProperties.Target target : properties.getTargets()) {
                if (target != null && host.equals(target.getHost()) && Integer.valueOf(port).equals(target.getPort())
                        && database.equals(target.getDatabase())) allowed.add(target);
            }
        }
        if (allowed.size() != 1) throw rejectedNetwork();
        DataSourceRuntimeProperties.Target target = allowed.get(0);
        if (username == null || !username.matches("[A-Za-z0-9_-]{1,32}") || "root".equalsIgnoreCase(username)
                || target.getUsernames() == null || !target.getUsernames().contains(username)) {
            throw new DataSourceFailure("ACCOUNT_NOT_ALLOWED", "仅允许部署名单中的专用只读数据库账号", 400);
        }
        Set<String> addresses = new HashSet<>();
        if (target.getAddresses() == null || target.getAddresses().isEmpty()) throw rejectedNetwork();
        for (String address : target.getAddresses()) addresses.add(literal(address));
        try {
            InetAddress[] resolved = resolver.resolve(host);
            if (resolved == null || resolved.length == 0) throw rejectedNetwork();
            List<String> pinned = new ArrayList<>();
            for (InetAddress address : resolved) {
                if (address == null || address.isAnyLocalAddress() || address.isMulticastAddress()
                        || address.isLinkLocalAddress() || !addresses.contains(address.getHostAddress())) throw rejectedNetwork();
                pinned.add(address.getHostAddress());
            }
            pinned.sort(Comparator.naturalOrder());
            return new Endpoint(host, port, database, pinned.get(0));
        } catch (UnknownHostException failure) { throw rejectedNetwork(); }
    }

    public void validateServices(List<String> services) {
        if (services == null || services.isEmpty() || services.size() > SERVICES.size()
                || new HashSet<>(services).size() != services.size() || properties.getAllowedServices() == null
                || services.stream().anyMatch(service -> service == null || !SERVICES.contains(service)
                        || !properties.getAllowedServices().contains(service))) {
            throw new DataSourceFailure("SERVICE_NOT_ALLOWED", "目标服务必须取自部署允许的服务名单", 400);
        }
    }

    public static String literal(String address) {
        if (address == null || !(address.matches("(?:[0-9]{1,3}\\.){3}[0-9]{1,3}")
                || address.matches("[0-9a-fA-F:]+") && address.contains(":"))) throw rejectedNetwork();
        try {
            InetAddress parsed = InetAddress.getByName(address);
            if (parsed.isAnyLocalAddress() || parsed.isMulticastAddress() || parsed.isLinkLocalAddress()) throw rejectedNetwork();
            if (!address.contains(":") && !address.equals(parsed.getHostAddress())) throw rejectedNetwork();
            return parsed.getHostAddress();
        } catch (UnknownHostException failure) { throw rejectedNetwork(); }
    }

    private static boolean validHost(String host) {
        if (host.contains(":")) {
            try { literal(host); return true; }
            catch (DataSourceFailure failure) { return false; }
        }
        if (host.matches("[0-9.]+")) {
            try { return host.equals(literal(host)); }
            catch (DataSourceFailure failure) { return false; }
        }
        return host.length() <= 253 && host.matches("[a-z][a-z0-9-]*(?:\\.[a-z0-9][a-z0-9-]*)*")
                && !host.contains("-.") && !host.endsWith("-");
    }

    private static DataSourceFailure invalidUrl() {
        return new DataSourceFailure("INVALID_URL", "连接地址必须为无参数的jdbc:mysql://白名单主机:端口/数据库", 400);
    }

    private static DataSourceFailure rejectedNetwork() {
        return new DataSourceFailure("NETWORK_NOT_ALLOWED", "数据库地址或解析结果不在部署网络名单内", 400);
    }

    public record Endpoint(String host, int port, String database, String address) {
        public String pinnedUrl() {
            return "jdbc:mysql://" + (address.contains(":") ? "[" + address + "]" : address) + ":" + port + "/" + database;
        }
    }

    @FunctionalInterface
    interface Resolver { InetAddress[] resolve(String host) throws UnknownHostException; }
}
