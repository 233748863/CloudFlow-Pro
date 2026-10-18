package com.cloudflow.workflow.service;

import com.cloudflow.common.redis.core.SysConfigHelper;
import com.cloudflow.common.tenant.TenantBroker;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.workflow.exception.WorkflowException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PreDestroy;
import java.io.InputStream;
import org.apache.hc.client5.http.classic.methods.*;
import org.apache.hc.client5.http.config.RequestConfig;
import org.apache.hc.client5.http.impl.classic.CloseableHttpClient;
import org.apache.hc.client5.http.impl.classic.HttpClients;
import org.apache.hc.core5.http.ContentType;
import org.apache.hc.core5.http.ConnectionRequestTimeoutException;
import org.apache.hc.core5.http.io.entity.StringEntity;
import org.apache.hc.core5.util.Timeout;
import org.springframework.stereotype.Service;

import java.net.InetAddress;
import java.net.SocketTimeoutException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

@Service
public class HttpClientService {
    private static final Set<String> METADATA_HOSTS = Set.of("metadata.google.internal", "metadata.google",
            "metadata", "instance-data", "instance-data.ec2.internal", "metadata.tencentyun.com");
    private final SysConfigHelper configHelper;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final ThreadPoolExecutor requests = new ThreadPoolExecutor(4, 8, 60, TimeUnit.SECONDS,
            new ArrayBlockingQueue<>(64), operation -> {
                Thread thread = new Thread(operation, "workflow-http");
                thread.setDaemon(true);
                return thread;
            }, new ThreadPoolExecutor.AbortPolicy());

    public HttpClientService(SysConfigHelper configHelper) {
        this.configHelper = configHelper;
    }

    public ApiResponse executeRequest(String url, String method, Map<String, String> headers, Map<String, Object> body) {
        return executeRequest(url, method, headers, body, 10000L);
    }

    public ApiResponse executeRequest(String url, String method, Map<String, String> headers,
                                       Map<String, Object> body, long timeoutMillis) {
        if (timeoutMillis <= 0 || timeoutMillis > 60000) {
            throw WorkflowException.validationError("外调超时必须大于0且不超过60000毫秒");
        }
        Long tenantId = TenantContext.getTenantId();
        AtomicReference<HttpUriRequestBase> running = new AtomicReference<>();
        AtomicBoolean cancelled = new AtomicBoolean();
        Future<ApiResponse> future;
        try {
            future = requests.submit(() -> TenantBroker.applyAs(tenantId,
                    ignored -> send(url, method, headers, body, timeoutMillis, running, cancelled)));
        } catch (java.util.concurrent.RejectedExecutionException overloaded) {
            return new ApiResponse(503, "外调执行队列已满", false);
        }
        try {
            return future.get(timeoutMillis, TimeUnit.MILLISECONDS);
        } catch (TimeoutException timeout) {
            cancelled.set(true);
            future.cancel(true);
            if (running.get() != null) running.get().cancel();
            return new ApiResponse(504, "外调请求超时", false);
        } catch (InterruptedException interrupted) {
            cancelled.set(true);
            future.cancel(true);
            if (running.get() != null) running.get().cancel();
            Thread.currentThread().interrupt();
            return new ApiResponse(503, "外调请求被中断", false);
        } catch (ExecutionException failure) {
            if (failure.getCause() instanceof WorkflowException policyFailure) throw policyFailure;
            return new ApiResponse(502, "外调请求失败", false);
        }
    }

    private ApiResponse send(String url, String method, Map<String, String> headers, Map<String, Object> body,
                              long timeoutMillis, AtomicReference<HttpUriRequestBase> running, AtomicBoolean cancelled) {
        assertUrlAllowed(url);
        if (cancelled.get()) return new ApiResponse(504, "外调请求超时", false);
        RequestConfig configuration = RequestConfig.custom().setConnectTimeout(Timeout.ofMilliseconds(timeoutMillis))
                .setConnectionRequestTimeout(Timeout.ofMilliseconds(timeoutMillis))
                .setResponseTimeout(Timeout.ofMilliseconds(timeoutMillis)).build();
        try (CloseableHttpClient client = HttpClients.custom().disableRedirectHandling().disableAutomaticRetries()
                .setDefaultRequestConfig(configuration).build()) {
            HttpUriRequestBase request = createRequest(method, url);
            running.set(request);
            if (headers != null) headers.forEach(request::setHeader);
            if (body != null && Set.of("POST", "PUT", "PATCH").contains(request.getMethod())) {
                request.setEntity(new StringEntity(objectMapper.writeValueAsString(body), ContentType.APPLICATION_JSON));
            }
            if (cancelled.get()) return new ApiResponse(504, "外调请求超时", false);
            return client.execute(request, response -> {
                String responseBody = "";
                if (response.getEntity() != null) {
                    try (InputStream content = response.getEntity().getContent()) {
                        byte[] bytes = content.readNBytes(1048577);
                        if (bytes.length > 1048576) return new ApiResponse(502, "外调响应超过1MB", false);
                        responseBody = new String(bytes, StandardCharsets.UTF_8);
                    }
                }
                int status = response.getCode();
                return new ApiResponse(status, responseBody, status >= 200 && status < 300);
            });
        } catch (SocketTimeoutException | ConnectionRequestTimeoutException timeout) {
            return new ApiResponse(504, "外调请求超时", false);
        } catch (Exception failure) {
            return new ApiResponse(cancelled.get() ? 504 : 502, "外调请求失败或超时", false);
        }
    }

    public void assertUrlAllowed(String url) {
        try {
            URI uri = URI.create(url);
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
            if (!Set.of("http", "https").contains(scheme)) {
                throw new WorkflowException("URL_SCHEME_FORBIDDEN", "外调仅允许HTTP和HTTPS");
            }
            if (uri.getUserInfo() != null || uri.getFragment() != null || uri.getPort() == 0 || uri.getPort() > 65535) {
                throw new WorkflowException("URL_INVALID", "外调地址不能包含用户凭证、片段或无效端口");
            }
            String host = normalizeHost(uri.getHost());
            if (host.isBlank() || host.contains("%") || host.contains("\\")
                    || (host.matches("[0-9.]+") && !strictIpv4(host))) {
                throw new WorkflowException("URL_INVALID", "外调主机地址无效");
            }
            if (METADATA_HOSTS.contains(host)) {
                throw new WorkflowException("URL_METADATA_FORBIDDEN", "禁止访问云元数据端点");
            }
            List<String> whitelist = whitelist();
            if (whitelist.isEmpty()) {
                throw new WorkflowException("URL_WHITELIST_EMPTY", "外调白名单为空，请先配置workflow.trigger.url.whitelist");
            }
            InetAddress[] addresses = resolveAddresses(host);
            if (addresses.length == 0) throw new WorkflowException("URL_INVALID", "外调主机解析失败");
            for (InetAddress address : addresses) {
                if (metadataAddress(address) || address.isAnyLocalAddress() || address.isMulticastAddress()) {
                    throw new WorkflowException("URL_METADATA_FORBIDDEN", "禁止访问云元数据、未指定或组播地址");
                }
                boolean matched = false;
                for (String entry : whitelist) {
                    if (matches(host, address, entry)) {
                        matched = true;
                        break;
                    }
                }
                if (!matched) {
                    throw new WorkflowException("URL_NOT_WHITELISTED", "外调目标或解析后的地址不在白名单内");
                }
            }
        } catch (WorkflowException policyFailure) {
            throw policyFailure;
        } catch (Exception failure) {
            throw new WorkflowException("URL_INVALID", "外调地址解析或白名单配置无效");
        }
    }

    protected InetAddress[] resolveAddresses(String host) throws java.net.UnknownHostException {
        return InetAddress.getAllByName(host);
    }

    private List<String> whitelist() throws com.fasterxml.jackson.core.JsonProcessingException {
        String raw = configHelper.getConfigValue("workflow.trigger.url.whitelist", "").trim();
        if (raw.isEmpty()) return List.of();
        List<String> values = raw.startsWith("[") ? objectMapper.readValue(raw, new TypeReference<List<String>>() {})
                : Arrays.asList(raw.split("[,;\\s]+"));
        return values.stream().filter(java.util.Objects::nonNull).map(String::trim).filter(value -> !value.isEmpty()).toList();
    }

    private boolean matches(String host, InetAddress address, String rawEntry) throws java.net.UnknownHostException {
        String entry = normalizeHost(rawEntry);
        if (entry.contains("/")) {
            String[] cidr = entry.split("/", -1);
            if (cidr.length != 2 || (!strictIpv4(cidr[0]) && !cidr[0].contains(":"))) return false;
            byte[] network = InetAddress.getByName(cidr[0]).getAddress();
            byte[] target = address.getAddress();
            int bits = Integer.parseInt(cidr[1]);
            if (network.length != target.length || bits < 0 || bits > network.length * 8) return false;
            for (int index = 0; index < network.length; index++) {
                int remaining = Math.max(0, Math.min(8, bits - index * 8));
                int mask = remaining == 0 ? 0 : 255 << (8 - remaining);
                if ((network[index] & mask) != (target[index] & mask)) return false;
            }
            return true;
        }
        if (strictIpv4(entry) || entry.contains(":")) return InetAddress.getByName(entry).equals(address);
        if (entry.startsWith("*.")) return host.endsWith(entry.substring(1)) && host.length() > entry.length() - 1;
        return !entry.contains("*") && entry.equals(host);
    }

    private static boolean metadataAddress(InetAddress address) {
        byte[] bytes = address.getAddress();
        if (bytes.length == 4) {
            return (bytes[0] & 255) == 169 && (bytes[1] & 255) == 254
                    || address.getHostAddress().equals("100.100.100.200")
                    || address.getHostAddress().equals("192.0.0.192");
        }
        return address.getHostAddress().equalsIgnoreCase("fd00:ec2:0:0:0:0:0:254") || address.isLinkLocalAddress();
    }

    private static String normalizeHost(String host) {
        if (host == null) return "";
        String normalized = host.trim().toLowerCase(Locale.ROOT);
        if (normalized.startsWith("[") && normalized.endsWith("]")) normalized = normalized.substring(1, normalized.length() - 1);
        while (normalized.endsWith(".")) normalized = normalized.substring(0, normalized.length() - 1);
        return normalized;
    }

    private static boolean strictIpv4(String host) {
        String[] parts = host.split("\\.", -1);
        if (parts.length != 4) return false;
        for (String part : parts) {
            if (!part.matches("0|[1-9][0-9]{0,2}") || Integer.parseInt(part) > 255) return false;
        }
        return true;
    }

    private HttpUriRequestBase createRequest(String method, String url) {
        return switch (method.toUpperCase(Locale.ROOT)) {
            case "GET" -> new HttpGet(url);
            case "POST" -> new HttpPost(url);
            case "PUT" -> new HttpPut(url);
            case "DELETE" -> new HttpDelete(url);
            case "PATCH" -> new HttpPatch(url);
            case "HEAD" -> new HttpHead(url);
            case "OPTIONS" -> new HttpOptions(url);
            default -> throw WorkflowException.validationError("不支持的HTTP方法");
        };
    }

    @PreDestroy
    public void close() {
        requests.shutdownNow();
    }

    public static class ApiResponse {
        private final int statusCode;
        private final String body;
        private final boolean success;

        public ApiResponse(int statusCode, String body, boolean success) {
            this.statusCode = statusCode;
            this.body = body;
            this.success = success;
        }

        public int getStatusCode() { return statusCode; }
        public String getBody() { return body; }
        public boolean isSuccess() { return success; }
    }
}
