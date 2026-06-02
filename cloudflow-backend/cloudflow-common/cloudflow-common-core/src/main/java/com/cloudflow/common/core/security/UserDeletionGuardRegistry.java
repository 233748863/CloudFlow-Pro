package com.cloudflow.common.core.security;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

@Component
@RequiredArgsConstructor
public class UserDeletionGuardRegistry {

    private final List<UserDeletionGuard> guards;

    public List<String> findBlockingReferences(Long userId) {
        List<String> result = new ArrayList<>();
        for (UserDeletionGuard guard : guards) {
            result.addAll(guard.findBlockingReferences(userId));
        }
        return result;
    }
}
