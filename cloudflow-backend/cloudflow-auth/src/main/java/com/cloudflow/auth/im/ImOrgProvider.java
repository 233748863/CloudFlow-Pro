package com.cloudflow.auth.im;

import java.util.List;
import java.util.Set;

public interface ImOrgProvider {
    String providerType();

    List<ImOrgSnapshot.Department> departments(WeComCredentials credentials);

    default ImOrgSnapshot snapshot(WeComCredentials credentials, ImConfigRequest.SyncScope scope) {
        return snapshot(credentials, scope, Set.of());
    }

    ImOrgSnapshot snapshot(WeComCredentials credentials, ImConfigRequest.SyncScope scope, Set<String> managedUserIds);
}
