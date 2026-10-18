package com.cloudflow.common.job.security;

import com.cloudflow.common.core.constant.SecurityConstants;
import com.cloudflow.common.core.domain.R;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpHeaders;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Collections;

public final class JobInternalAuthenticationFilter extends OncePerRequestFilter {
    private final JobRequestSignature signature;
    private final StringRedisTemplate redis;
    private final ObjectMapper json;

    public JobInternalAuthenticationFilter(JobRequestSignature signature, StringRedisTemplate redis, ObjectMapper json) {
        this.signature = signature; this.redis = redis; this.json = json;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getServletPath();
        return !path.equals("/inner/job") && !path.startsWith("/inner/job/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        HttpHeaders headers = new HttpHeaders();
        for (String name : JobRequestSignature.BOUND_HEADERS) {
            headers.put(name, Collections.list(request.getHeaders(name)));
            if (headers.get(name).isEmpty()) headers.remove(name);
        }
        String target = request.getRequestURI() + (request.getQueryString() == null ? "" : "?" + request.getQueryString());
        if (!signature.verify(headers, request.getMethod(), target)) { reject(response, 403); return; }
        byte[] body = request.getInputStream().readAllBytes();
        if (!signature.matchesBody(headers, body)) { reject(response, 403); return; }
        try {
            String key = "cloudflow:job:internal-nonce:" + headers.getFirst(SecurityConstants.FROM_SERVICE_HEADER)
                    + ":" + headers.getFirst(JobRequestSignature.NONCE);
            // Cover both inclusive 300-second boundaries and subsecond clock truncation.
            if (!Boolean.TRUE.equals(redis.opsForValue().setIfAbsent(key, "1", Duration.ofSeconds(601)))) {
                reject(response, 403); return;
            }
        } catch (RuntimeException exception) { reject(response, 503); return; }
        chain.doFilter(new BufferedJobRequest(request, body), response);
    }

    private void reject(HttpServletResponse response, int status) throws IOException {
        response.setStatus(status);
        response.setContentType("application/json");
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        json.writeValue(response.getOutputStream(), R.fail(status,
                status == 503 ? "内部任务身份校验暂不可用" : "内部任务身份校验失败"));
    }

    private static final class BufferedJobRequest extends HttpServletRequestWrapper {
        private final byte[] body;
        private BufferedJobRequest(HttpServletRequest request, byte[] body) { super(request); this.body = body; }
        @Override
        public ServletInputStream getInputStream() {
            ByteArrayInputStream input = new ByteArrayInputStream(body);
            return new ServletInputStream() {
                @Override public int read() { return input.read(); }
                @Override public int read(byte[] bytes, int offset, int length) { return input.read(bytes, offset, length); }
                @Override public boolean isFinished() { return input.available() == 0; }
                @Override public boolean isReady() { return true; }
                @Override public void setReadListener(ReadListener listener) { throw new UnsupportedOperationException("Synchronous job request body"); }
            };
        }
        @Override public BufferedReader getReader() { return new BufferedReader(new InputStreamReader(getInputStream(), StandardCharsets.UTF_8)); }
    }
}
