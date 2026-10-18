package com.cloudflow.auth.im;

import java.time.Instant;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Component
public class WeComOrgProvider implements ImOrgProvider {
    private final ImProperties properties;
    private final ImAccessTokens tokens;
    private final WeComHttp http;

    @Autowired
    public WeComOrgProvider(ImProperties properties, ImAccessTokens tokens) {
        this(properties, tokens, new WeComHttp());
    }

    WeComOrgProvider(ImProperties properties, ImAccessTokens tokens, WeComHttp http) {
        this.properties = properties;
        this.tokens = tokens;
        this.http = http;
    }

    @Override
    public String providerType() { return "WECOM"; }

    @Override
    public ImOrgSnapshot snapshot(WeComCredentials credentials, ImConfigRequest.SyncScope scope, Set<String> managedUserIds) {
        return snapshot(sdk(credentials), credentials, scope, managedUserIds);
    }

    @Override
    public List<ImOrgSnapshot.Department> departments(WeComCredentials credentials) {
        return departments(sdk(credentials), credentials);
    }

    private WeComSdk sdk(WeComCredentials credentials) {
        if (!properties.isEnabled()) throw ImFailure.disabled();
        return new WeComSdk(credentials, http, () -> tokens.resolve(credentials,
                () -> WeComSdk.fetchToken(credentials, http)), rejected -> tokens.discard(credentials, rejected));
    }

    static List<ImOrgSnapshot.Department> departments(WeComSdk sdk, WeComCredentials credentials) {
        WeComOrgReader reader = new WeComOrgReader(sdk);
        Set<Long> visibility = reader.visibility(credentials.agentId());
        Map<Long, ImOrgSnapshot.Department> departments = reader.departments();
        if (!departments.keySet().containsAll(visibility)) throw ImFailure.orgScope();
        List<Long> roots = visibility.stream().sorted().toList();
        Set<Long> selected = new HashSet<>();
        for (int offset = 0; offset < roots.size(); offset += 100) {
            selected.addAll(ImOrgTopology.select(departments, Set.copyOf(roots.subList(offset, Math.min(roots.size(), offset + 100))), visibility));
        }
        if (!departments.equals(reader.departments()) || !visibility.equals(reader.visibility(credentials.agentId()))
                || !departments.equals(reader.departments()) || !visibility.equals(reader.visibility(credentials.agentId()))) throw ImFailure.orgChanged();
        return departments.values().stream().filter(department -> selected.contains(department.id()))
                .sorted(Comparator.comparingLong(ImOrgSnapshot.Department::id)).toList();
    }

    static ImOrgSnapshot snapshot(WeComSdk sdk, WeComCredentials credentials, ImConfigRequest.SyncScope scope) {
        return snapshot(sdk, credentials, scope, Set.of());
    }

    static ImOrgSnapshot snapshot(WeComSdk sdk, WeComCredentials credentials, ImConfigRequest.SyncScope scope, Set<String> managedUserIds) {
        ImOrgScope selectedScope = ImOrgScope.copy(scope);
        if (managedUserIds == null || managedUserIds.size() > ImLocalOrganization.MAX_LOCAL_USERS
                || managedUserIds.stream().anyMatch(identifier -> identifier == null || !identifier.matches("[A-Za-z0-9_.@=-]{1,128}"))
                || managedUserIds.stream().map(identifier -> identifier.toLowerCase(java.util.Locale.ROOT)).distinct().count() != managedUserIds.size()) {
            throw ImFailure.orgIncomplete();
        }
        Set<String> managed = Set.copyOf(managedUserIds);
        WeComOrgReader reader = new WeComOrgReader(sdk);
        Set<Long> visibility = reader.visibility(credentials.agentId());
        Map<Long, ImOrgSnapshot.Department> departments = reader.departments();
        Set<Long> selected = ImOrgTopology.select(departments, selectedScope.roots(), visibility);
        Map<String, ImOrgSnapshot.Member> members = reader.members(selected);
        Map<String, ImOrgSnapshot.Member> outside = reader.outOfScope(managed, members, selected, departments.keySet());
        if (!departments.equals(reader.departments()) || !visibility.equals(reader.visibility(credentials.agentId()))) throw ImFailure.orgChanged();
        Map<String, ImOrgSnapshot.Member> confirmed = reader.members(selected);
        Map<String, ImOrgSnapshot.Member> confirmedOutside = reader.outOfScope(managed, confirmed, selected, departments.keySet());
        if (!members.equals(confirmed) || !outside.equals(confirmedOutside) || !departments.equals(reader.departments())
                || !visibility.equals(reader.visibility(credentials.agentId()))) throw ImFailure.orgChanged();
        return new ImOrgSnapshot(credentials.tenantId(), credentials.configId(), credentials.version(), credentials.corpId(),
                credentials.agentId(), Instant.now(), selectedScope.localRootDeptId(), selectedScope.roots(), selectedScope.primaryDepartments(),
                departments.values().stream().filter(department -> selected.contains(department.id()))
                        .sorted(Comparator.comparingLong(ImOrgSnapshot.Department::id)).toList(),
                members.values().stream().sorted(Comparator.comparing(ImOrgSnapshot.Member::id)).toList(),
                outside.values().stream().sorted(Comparator.comparing(ImOrgSnapshot.Member::id)).toList());
    }
}
