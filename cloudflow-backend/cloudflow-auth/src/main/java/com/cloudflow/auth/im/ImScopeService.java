package com.cloudflow.auth.im;

import com.cloudflow.common.core.domain.PageResult;
import java.util.List;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Service
@RequiredArgsConstructor
public class ImScopeService {
    private static final String MANAGE = "system:im:config:manage";
    private final ImActors actors;
    private final ImDatabase database;
    private final ImConfigRules rules;
    private final ImOrgProvider provider;

    public PageResult<ImViews.DepartmentOption> localDepartments(String keyword, int pageNum, int pageSize) {
        ImActors.Actor actor = actors.management(MANAGE);
        if (keyword == null || keyword.length() > 30 || keyword.codePoints().anyMatch(Character::isISOControl)
                || pageNum < 1 || pageNum > 1000000 || pageSize < 1 || pageSize > 100) throw ImFailure.configuration();
        return database.read(actor.tenantId(), mapper -> {
            actors.verify(mapper, actor, MANAGE, false);
            List<ImViews.DepartmentOption> departments = mapper.scopeDepartments(actor.tenantId(), keyword.strip(), (long) (pageNum - 1) * pageSize, pageSize);
            return new PageResult<>(departments, mapper.countScopeDepartments(actor.tenantId(), keyword.strip()), pageNum, pageSize);
        });
    }

    public ImViews.RemoteDepartments remoteDepartments(Long configId, ImVersionRequest request) {
        ImActors.Actor actor = actors.management(MANAGE);
        if (TransactionSynchronizationManager.isActualTransactionActive()) throw ImFailure.orgLocal();
        if (configId == null || configId <= 0 || request == null) throw ImFailure.configuration();
        rules.requireDeployment();
        ImConfigRow original = database.read(actor.tenantId(), mapper -> {
            actors.verify(mapper, actor, MANAGE, false);
            ImConfigRow config = mapper.config(actor.tenantId(), configId);
            ImConfigRules.version(config, request.getVersion());
            requireActive(config);
            return config;
        });
        WeComCredentials credentials = rules.credentials(original);
        if (!Objects.equals(provider.providerType(), original.getImType())) throw ImFailure.unsupported();
        List<ImOrgSnapshot.Department> departments = provider.departments(credentials);
        return database.read(actor.tenantId(), mapper -> {
            actors.verify(mapper, actor, MANAGE, false);
            ImConfigRow current = mapper.config(actor.tenantId(), configId);
            ImConfigRules.version(current, request.getVersion());
            rules.requireDeployment();
            requireActive(current);
            if (!Objects.equals(current.getCorpId(), original.getCorpId()) || !Objects.equals(current.getAgentId(), original.getAgentId())) throw ImFailure.conflict();
            return new ImViews.RemoteDepartments(configId, current.getVersion(), departments.stream()
                    .map(department -> new ImViews.DepartmentOption(department.id(), department.parentId(), department.name())).toList());
        });
    }

    private static void requireActive(ImConfigRow config) {
        if (!"WECOM".equals(config.getImType())) throw ImFailure.unsupported();
        if (!"ENABLED".equals(config.getStatus())) throw ImFailure.disabled();
    }
}
