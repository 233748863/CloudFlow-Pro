package com.cloudflow.auth.im;

import com.cloudflow.common.core.domain.PageResult;
import java.time.LocalDateTime;
import java.util.List;

public final class ImViews {
    private ImViews() { }

    public record Provider(String type, String name, boolean implemented) { }

    public record Overview(boolean deploymentEnabled, boolean canConfigure, String reason,
            List<Provider> providers, PageResult<Config> page) { }

    public record Config(Long configId, String imType, String corpId, String agentId, boolean appKeyConfigured,
            boolean appSecretConfigured, boolean tokenConfigured, boolean aesKeyConfigured, String callbackUrl,
            String expectedCallbackUrl, boolean syncEnabled, String syncCron, boolean loginEnabled, boolean messageEnabled,
            boolean todoEnabled, ImConfigRequest.SyncScope syncScope, LocalDateTime lastSyncTime, String status,
            int version, LocalDateTime updateTime) { }

    public record TestResult(boolean successful, String reasonCode, String message, long elapsedMillis, int version) { }

    public record DepartmentOption(long id, long parentId, String name) { }

    public record RemoteDepartments(long configId, int version, List<DepartmentOption> departments) { }
}
