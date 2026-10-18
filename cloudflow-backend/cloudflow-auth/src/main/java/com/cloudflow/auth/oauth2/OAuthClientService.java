package com.cloudflow.auth.oauth2;

import com.cloudflow.auth.domain.SysFile;
import com.cloudflow.auth.domain.SysTenant;
import com.cloudflow.auth.mapper.OAuthMapper;
import com.cloudflow.auth.mapper.SysFileMapper;
import com.cloudflow.auth.platform.PlatformAccessService;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.audit.annotation.HighRiskAction;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.security.oauth2.OAuthAccessPolicy;
import com.cloudflow.common.security.oauth2.OAuthDigests;
import com.cloudflow.common.security.oauth2.OAuthFailure;
import com.cloudflow.common.security.oauth2.OAuthScope;
import com.cloudflow.common.tenant.TenantBroker;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class OAuthClientService {
    private final PlatformAccessService platform;
    private final OAuthDatabase database;
    private final OAuthProperties properties;
    private final OAuthAccessPolicy policy;
    private final OAuthSecretCipher secrets;
    private final OAuthActors actors;
    private final OAuthJson json;
    private final OAuthAudit audit;
    private final OAuthRevocations revocations;
    private final SysFileMapper files;

    public OAuthViews.Overview list(int pageNum, int pageSize) {
        platform.requireRecent("system:oauth2:client:list");
        OAuthClientRules.page(pageNum, pageSize);
        return database.read(mapper -> new OAuthViews.Overview(policy.configured(), policy.reason(), OAuthScope.views(),
                new PageResult<>(mapper.clients((long) (pageNum - 1) * pageSize, pageSize).stream().map(this::view).toList(),
                        mapper.clientCount(), pageNum, pageSize)));
    }

    @HighRiskAction
    @Audit(name = "新增第三方客户端", highRisk = true)
    public OAuthViews.Created create(OAuthClientRequest request) {
        PlatformAccessService.Operator operator = platform.requireRecent("system:oauth2:client:manage");
        if (request == null || request.getClientId() != null || request.getVersion() != null || !"DISABLED".equals(request.getStatus())) {
            throw OAuthFailure.invalid("新增客户端须为停用状态，不能指定编号或版本");
        }
        String raw = "CONFIDENTIAL".equals(request.getClientType()) ? OAuthDigests.random() : null;
        OAuthClient row = database.write(mapper -> {
            validate(request, mapper);
            if (request.getClientSecret() != null || !(raw == null ? "NONE" : "GENERATE").equals(request.getSecretAction())) {
                throw OAuthFailure.invalid("新增机密客户端由服务器生成密钥，公共客户端不使用密钥");
            }
            OAuthClient created = new OAuthClient();
            created.setTenantId(request.getTenantId());
            created.setClientKey("cf_" + OAuthDigests.random());
            created.setClientType(request.getClientType());
            created.setClientSecretEncrypted(raw == null ? null : secrets.encrypt(raw));
            created.setVersion(0);
            created.setDeleted(0);
            assign(created, request, operator);
            created.setCreateBy(String.valueOf(operator.userId()));
            created.setCreateTime(created.getUpdateTime());
            if (mapper.insertClient(created) != 1) throw saveFailed();
            audit.append(operator.tenantId(), operator.userId(), "CLIENT_CREATE", "", state(created), true);
            return created;
        });
        return new OAuthViews.Created(view(row), raw);
    }

    @HighRiskAction
    @Audit(name = "修改第三方客户端", highRisk = true)
    public OAuthViews.Client update(OAuthClientRequest request) {
        PlatformAccessService.Operator operator = platform.requireRecent("system:oauth2:client:manage");
        if (request == null || request.getClientId() == null || request.getVersion() == null) throw conflict();
        OAuthClient row = database.write(mapper -> {
            OAuthClient current = mapper.lockClient(request.getClientId());
            version(current, request.getVersion());
            if (!Objects.equals(current.getTenantId(), request.getTenantId()) || !Objects.equals(current.getClientType(), request.getClientType())) {
                throw OAuthFailure.invalid("客户端所属企业和类型不能修改，请另建客户端");
            }
            validate(request, mapper);
            String before = state(current);
            if ("REPLACE".equals(request.getSecretAction()) && "CONFIDENTIAL".equals(current.getClientType())) {
                current.setClientSecretEncrypted(secrets.encrypt(request.getClientSecret()));
            } else if (!"KEEP".equals(request.getSecretAction()) || request.getClientSecret() != null) {
                throw OAuthFailure.invalid("密钥变更意图无效，保留密钥时不能提交密钥值");
            }
            assign(current, request, operator);
            if ("ACTIVE".equals(current.getStatus()) && "CONFIDENTIAL".equals(current.getClientType())) secrets.requireKey();
            if (mapper.updateClient(current) != 1) throw conflict();
            current.setVersion(current.getVersion() + 1);
            revocations.invalidate(mapper, current.getTenantId(), current.getClientId(), null, null, "CLIENT_POLICY_CHANGED");
            mapper.revokeApprovals(current.getTenantId(), current.getClientId(), null, LocalDateTime.now());
            audit.append(operator.tenantId(), operator.userId(), "CLIENT_UPDATE", before, state(current), true);
            return current;
        });
        return view(row);
    }

    @HighRiskAction
    @Audit(name = "停用第三方客户端", highRisk = true)
    public OAuthViews.Client disable(Long clientId, Integer expectedVersion) {
        PlatformAccessService.Operator operator = platform.requireRecent("system:oauth2:client:manage");
        return view(database.write(mapper -> {
            OAuthClient current = mapper.lockClient(clientId);
            version(current, expectedVersion);
            String before = state(current);
            current.setStatus("DISABLED");
            current.setUpdateBy(String.valueOf(operator.userId()));
            current.setUpdateTime(LocalDateTime.now());
            if (mapper.updateClient(current) != 1) throw conflict();
            current.setVersion(current.getVersion() + 1);
            revocations.invalidate(mapper, current.getTenantId(), clientId, null, null, "CLIENT_DISABLED");
            mapper.revokeApprovals(current.getTenantId(), clientId, null, LocalDateTime.now());
            audit.append(operator.tenantId(), operator.userId(), "CLIENT_DISABLE", before, state(current), true);
            return current;
        }));
    }

    public OAuthViews.Client view(OAuthClient row) {
        return new OAuthViews.Client(row.getClientId(), row.getTenantId(), row.getClientKey(), row.getClientType(), row.getClientName(),
                row.getLogoFileId(), row.getDescription(), row.getServiceUserId(), row.getClientSecretEncrypted() != null,
                row.getAccessTokenValiditySeconds(), row.getRefreshTokenValiditySeconds(), json.strings(row.getRedirectUris()),
                json.strings(row.getGrantTypes()), json.strings(row.getScopes()), json.strings(row.getAutoApproveScopes()),
                json.strings(row.getAuthorities()), json.strings(row.getResourceIds()), row.getStatus(), row.getVersion());
    }

    private void validate(OAuthClientRequest request, OAuthMapper mapper) {
        if (request.getTenantId() == null || request.getTenantId() <= 0 || request.getClientType() == null
                || !Set.of("PUBLIC", "CONFIDENTIAL").contains(request.getClientType()) || request.getStatus() == null
                || !Set.of("ACTIVE", "DISABLED").contains(request.getStatus())
                || request.getClientName() == null || request.getClientName().isBlank() || request.getClientName().length() > 100
                || request.getDescription() != null && request.getDescription().length() > 1000
                || request.getAccessTokenValiditySeconds() == null || request.getAccessTokenValiditySeconds() < 60
                || request.getAccessTokenValiditySeconds() > 3600 || request.getRefreshTokenValiditySeconds() == null
                || request.getRefreshTokenValiditySeconds() < 3600 || request.getRefreshTokenValiditySeconds() > 2592000) {
            throw OAuthFailure.invalid("客户端类型、名称、状态或令牌有效期不合法");
        }
        SysTenant tenant = mapper.tenant(request.getTenantId());
        if (tenant == null || !"0".equals(tenant.getStatus()) || !Integer.valueOf(0).equals(tenant.getDeleted())
                || tenant.getExpireTime() != null && !tenant.getExpireTime().isAfter(LocalDateTime.now())) {
            throw OAuthFailure.invalid("客户端所属企业不存在、已停用或已到期");
        }
        List<String> grants = OAuthClientRules.distinct(request.getGrantTypes(), 2, true);
        if (!Set.of("authorization_code", "client_credentials").containsAll(grants)
                || "PUBLIC".equals(request.getClientType()) && grants.contains("client_credentials")) throw OAuthFailure.invalid("不支持此客户端授权模式");
        List<String> scopes = OAuthClientRules.scopes(request.getScopes());
        List<String> automatic = OAuthClientRules.distinct(request.getAutoApproveScopes(), 4, false);
        OAuthClientRules.subset(automatic, scopes);
        List<String> redirects = OAuthClientRules.distinct(request.getRedirectUris(), 20, grants.contains("authorization_code"));
        redirects.forEach(value -> OAuthClientRules.redirect(value, properties.isAllowLoopbackHttp()));
        if (!grants.contains("authorization_code") && (!redirects.isEmpty() || !automatic.isEmpty())) throw OAuthFailure.invalid("客户端凭据模式不使用回调或自动同意");
        List<String> authorities = scopes.stream().map(OAuthScope::require).map(OAuthScope::authority).toList();
        List<String> resources = scopes.stream().map(OAuthScope::require).map(OAuthScope::resource).toList();
        if (request.getAuthorities() != null && !Set.copyOf(OAuthClientRules.distinct(request.getAuthorities(), 4, false)).equals(Set.copyOf(authorities))
                || request.getResourceIds() != null && !Set.copyOf(OAuthClientRules.distinct(request.getResourceIds(), 4, false)).equals(Set.copyOf(resources))) {
            throw OAuthFailure.invalid("资源权限必须与所选注册范围精确对应");
        }
        if (grants.contains("client_credentials")) {
            if (request.getServiceUserId() == null) throw OAuthFailure.invalid("请指定专用只读服务账号");
            OAuthActors.Actor actor = actors.load(mapper, request.getTenantId(), request.getServiceUserId());
            actors.serviceAccount(actor);
            if (scopes.contains("profile") && !grants.contains("authorization_code")) {
                throw OAuthFailure.invalid("纯客户端凭据模式不支持本人资料范围");
            }
            actors.requireScopes(actor, scopes.stream().filter(scope -> !"profile".equals(scope)).toList(), true);
        } else if (request.getServiceUserId() != null) throw OAuthFailure.invalid("授权码模式不能指定服务账号");
        if ("ACTIVE".equals(request.getStatus())) policy.requireAvailable();
        if (request.getLogoFileId() != null) {
            SysFile logo = files.selectById(request.getLogoFileId());
            if (logo == null || !Objects.equals(request.getTenantId(), logo.getTenantId()) || !Integer.valueOf(0).equals(logo.getDeleted())
                    || !"PUBLIC".equals(logo.getAccessType()) || logo.getFileType() == null
                    || !Set.of("png", "jpg", "jpeg", "webp").contains(logo.getFileType())
                    || logo.getFileSize() == null || logo.getFileSize() <= 0 || logo.getFileSize() > 2097152) {
                throw OAuthFailure.invalid("应用标识须为本企业公开的PNG、JPEG或WebP图片，最大2MiB");
            }
        }
    }

    private void assign(OAuthClient row, OAuthClientRequest request, PlatformAccessService.Operator operator) {
        List<String> scopes = OAuthClientRules.scopes(request.getScopes());
        row.setClientName(request.getClientName().trim());
        row.setDescription(request.getDescription());
        row.setLogoFileId(request.getLogoFileId());
        row.setServiceUserId(request.getServiceUserId());
        row.setAccessTokenValiditySeconds(request.getAccessTokenValiditySeconds());
        row.setRefreshTokenValiditySeconds(request.getRefreshTokenValiditySeconds());
        row.setRedirectUris(json.write(request.getRedirectUris()));
        row.setGrantTypes(json.write(request.getGrantTypes()));
        row.setScopes(json.write(scopes));
        row.setAutoApproveScopes(json.write(request.getAutoApproveScopes() == null ? List.of() : request.getAutoApproveScopes()));
        row.setAuthorities(json.write(scopes.stream().map(OAuthScope::require).map(OAuthScope::authority).toList()));
        row.setResourceIds(json.write(scopes.stream().map(OAuthScope::require).map(OAuthScope::resource).toList()));
        row.setStatus(request.getStatus());
        row.setUpdateBy(String.valueOf(operator.userId()));
        row.setUpdateTime(LocalDateTime.now());
    }

    static void version(OAuthClient client, Integer expected) {
        if (client == null || expected == null || !Objects.equals(client.getVersion(), expected)) throw conflict();
    }

    private static String state(OAuthClient client) {
        return "client=" + client.getClientId() + ";tenant=" + client.getTenantId() + ";version=" + client.getVersion() + ";status=" + client.getStatus();
    }

    private static OAuthFailure conflict() { return new OAuthFailure("conflict", "客户端已变化，请重新读取后确认", 409); }
    private static OAuthFailure saveFailed() { return new OAuthFailure("server_error", "客户端保存失败", 503); }
}
