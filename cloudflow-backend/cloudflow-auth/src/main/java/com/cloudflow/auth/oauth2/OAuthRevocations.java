package com.cloudflow.auth.oauth2;

import com.cloudflow.auth.mapper.OAuthMapper;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.audit.annotation.HighRiskAction;
import com.cloudflow.common.security.oauth2.OAuthTokens;
import java.time.LocalDateTime;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Slf4j
@Service
@RequiredArgsConstructor
public class OAuthRevocations {
    private final OAuthDatabase database;
    private final OAuthTokens tokens;

    @HighRiskAction
    @Audit(name = "撤销第三方关联令牌", highRisk = true)
    public void invalidate(OAuthMapper mapper, Long tenantId, Long clientId, Long userId, String familyId, String reason) {
        if (tenantId == null || clientId == null) throw new IllegalArgumentException("撤销范围缺少租户或客户端");
        List<String> hashes = mapper.activeHashes(tenantId, clientId, userId, familyId);
        LocalDateTime now = LocalDateTime.now();
        mapper.revokeAccess(tenantId, clientId, userId, familyId, reason, now);
        mapper.revokeRefresh(tenantId, clientId, userId, familyId, now);
        if (familyId == null) mapper.denyCodes(tenantId, clientId, userId, now);
        endAfterCommit(hashes);
    }

    @HighRiskAction
    @Audit(name = "撤销账号第三方授权", highRisk = true)
    public void forUser(Long tenantId, Long userId) {
        if (tenantId == null || userId == null) throw new IllegalArgumentException("账号撤销范围缺少租户或用户");
        database.write(mapper -> {
            if (mapper.lockUser(tenantId, userId) == null) return null;
            List<String> hashes = mapper.activeHashes(tenantId, null, userId, null);
            LocalDateTime now = LocalDateTime.now();
            mapper.revokeAccess(tenantId, null, userId, null, "USER_DISABLED", now);
            mapper.revokeRefresh(tenantId, null, userId, null, now);
            mapper.denyCodes(tenantId, null, userId, now);
            mapper.revokeApprovals(tenantId, null, userId, now);
            endAfterCommit(hashes);
            return null;
        });
    }

    public void endAfterCommit(List<String> hashes) {
        if (hashes.isEmpty()) return;
        List<String> immutable = List.copyOf(hashes);
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() { clear(immutable); }
            });
        } else {
            clear(immutable);
        }
    }

    private void clear(List<String> hashes) {
        try { tokens.end(hashes); }
        catch (RuntimeException unavailable) { log.warn("第三方令牌数据库已撤销，会话投影清理暂不可用，旧投影无法通过数据库验证"); }
    }
}
