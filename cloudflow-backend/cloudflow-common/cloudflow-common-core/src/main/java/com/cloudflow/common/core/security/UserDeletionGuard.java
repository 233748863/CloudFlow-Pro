package com.cloudflow.common.core.security;

import java.util.List;

public interface UserDeletionGuard {

    List<String> findBlockingReferences(Long userId);
}
