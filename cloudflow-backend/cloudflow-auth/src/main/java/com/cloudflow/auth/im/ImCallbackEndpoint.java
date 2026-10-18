package com.cloudflow.auth.im;

import com.cloudflow.auth.domain.SysTenant;
import com.cloudflow.auth.mapper.ImCallbackMapper;
import com.cloudflow.common.audit.domain.SysAuditLogEntity;
import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import com.cloudflow.common.core.utils.IpUtils;
import com.cloudflow.common.security.im.ImLoginPaths;
import com.cloudflow.common.security.im.ImLoginTransport;
import com.cloudflow.common.tenant.TenantBroker;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDateTime;
import java.util.Collections;
import java.util.HexFormat;
import java.util.Objects;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class ImCallbackEndpoint {
    private final ImDatabase database;
    private final ImCallbackMapper mapper;
    private final ImConfigRules rules;
    private final ImCallbackInbox inbox;
    private final SysAuditLogMapper audits;
    private final ImCallbackLimits limits;
    private final WeComCallbackCodec codec = new WeComCallbackCodec();

    public String handle(long configId, HttpServletRequest request) {
        rules.requireDeployment();
        String sourceIp = transport(configId, request);
        limits.require(sourceIp);
        boolean echo = "GET".equals(request.getMethod());
        byte[] body = new byte[0];
        WeComCredentials credentials = null;
        try {
            parameters(request, echo ? Set.of("msg_signature", "timestamp", "nonce", "echostr") : Set.of("msg_signature", "timestamp", "nonce"));
            String signature = parameter(request, "msg_signature", 40);
            String timestamp = parameter(request, "timestamp", 12);
            String nonce = parameter(request, "nonce", 128);
            if (echo) body = parameter(request, "echostr", ImCallbackXml.MAX_BYTES).getBytes(StandardCharsets.UTF_8);
            else {
                String contentType = request.getContentType();
                if (contentType == null || !Set.of("application/xml", "text/xml").contains(contentType.split(";", 2)[0].trim().toLowerCase(java.util.Locale.ROOT))
                        || request.getContentLengthLong() > ImCallbackXml.MAX_BYTES) throw ImFailure.callback();
                body = request.getInputStream().readNBytes(ImCallbackXml.MAX_BYTES + 1);
                if (body.length == 0 || body.length > ImCallbackXml.MAX_BYTES) throw ImFailure.callback();
            }
            credentials = configuration(configId, !echo);
            if (echo) {
                String result = codec.echo(credentials, signature, timestamp, nonce, new String(body, StandardCharsets.UTF_8));
                WeComCredentials current = configuration(configId, false);
                if (!credentials.equals(current)) throw ImFailure.disabled();
                return result;
            }
            ImCardCallback event = ImCardCallback.parse(credentials, codec.event(credentials, signature, timestamp, nonce, body));
            ImCallbackInbox.Receipt receipt = inbox.receive(credentials, event, sourceIp);
            if ("IM_CALLBACK_REPLAY_CONFLICT".equals(receipt.resultCode())) throw ImFailure.callback();
            return "success";
        } catch (ImFailure failure) {
            rejected(credentials, configId, sourceIp, digest(body), failure.getReasonCode());
            throw failure;
        } catch (IOException failure) {
            rejected(credentials, configId, sourceIp, digest(body), "IM_CALLBACK_INVALID");
            throw ImFailure.callback();
        }
    }

    private WeComCredentials configuration(long configId, boolean requireTodo) {
        Long tenantId = TenantBroker.applyWithoutTenant(ignored -> mapper.configurationTenant(configId));
        if (tenantId == null || tenantId <= 0) throw ImFailure.callback();
        return database.read(tenantId, scoped -> {
            ImConfigRow row = scoped.config(tenantId, configId);
            SysTenant tenant = scoped.tenant(tenantId);
            String expected = rules.expectedCallbackUrl(configId);
            if (row == null || !Objects.equals(tenantId, row.getTenantId()) || !"WECOM".equals(row.getImType())
                    || !"ENABLED".equals(row.getStatus()) || !Integer.valueOf(0).equals(row.getDeleted())
                    || requireTodo && !Boolean.TRUE.equals(row.getTodoEnabled()) || expected == null || !expected.equals(row.getCallbackUrl())
                    || tenant == null || !"0".equals(tenant.getStatus()) || !Integer.valueOf(0).equals(tenant.getDeleted())
                    || tenant.getExpireTime() != null && !tenant.getExpireTime().isAfter(LocalDateTime.now())) throw ImFailure.disabled();
            WeComCredentials result = rules.credentials(row);
            result.requireCallbackKeys();
            return result;
        });
    }

    private String transport(long configId, HttpServletRequest request) {
        if (request == null || configId <= 0 || !ImLoginPaths.callbackEndpoint(request.getMethod(), request.getRequestURI())
                || !("/im/callback/" + configId).equals(ImLoginPaths.normalized(request.getRequestURI()))) throw ImFailure.callback();
        try {
            String remote = request.getRemoteAddr();
            boolean trusted = IpUtils.isTrustedProxy(remote);
            String proto = trusted ? header(request, "X-Forwarded-Proto") : null;
            if (!ImLoginTransport.secure(request.isSecure(), remote, proto)) throw ImFailure.loginTransport();
            String forwarded = trusted ? header(request, "X-Forwarded-For") : null;
            if (forwarded != null) ImLoginTransport.numeric(forwarded);
            return ImLoginTransport.address(remote, forwarded);
        } catch (IllegalArgumentException failure) { throw ImFailure.loginTransport(); }
    }

    private String header(HttpServletRequest request, String name) {
        return ImLoginTransport.single(Collections.list(request.getHeaders(name)));
    }

    private void parameters(HttpServletRequest request, Set<String> allowed) {
        if (!allowed.equals(request.getParameterMap().keySet())) throw ImFailure.callback();
        for (String[] values : request.getParameterMap().values()) if (values == null || values.length != 1) throw ImFailure.callback();
    }

    private String parameter(HttpServletRequest request, String name, int maximum) {
        String value = request.getParameter(name);
        if (value == null || value.isBlank() || value.length() > maximum || value.codePoints().anyMatch(Character::isISOControl)) throw ImFailure.callback();
        return value;
    }

    private void rejected(WeComCredentials credentials, long configId, String sourceIp, String hash, String reason) {
        if (credentials == null) {
            log.warn("IM_CALLBACK_REJECTED config={} sourceIp={} digest={} reason={}", configId, sourceIp, hash, reason);
            return;
        }
        database.write(credentials.tenantId(), scoped -> {
            SysAuditLogEntity entry = new SysAuditLogEntity();
            entry.setTenantId(credentials.tenantId()); entry.setBizModule("system"); entry.setAuditName(reason);
            entry.setAuditField("im_callback_config:" + configId);
            entry.setAfterVal("sourceIp=" + sourceIp + ";digest=" + hash);
            entry.setHighRisk(1); entry.setRiskLevel("HIGH"); entry.setCreateBy("im-callback"); entry.setCreateTime(LocalDateTime.now());
            if (audits.insert(entry) != 1) throw ImFailure.audit();
            return null;
        });
    }

    private String digest(byte[] bytes) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)); }
        catch (NoSuchAlgorithmException failure) { throw ImFailure.callback(); }
    }
}
