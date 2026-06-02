package com.cloudflow.auth.service.impl;

import com.cloudflow.auth.service.LogImmutabilityGuardService;
import org.springframework.stereotype.Service;

@Service
public class LogImmutabilityGuardServiceImpl implements LogImmutabilityGuardService {

    private static final String IMMUTABLE_ERROR = "ERR.AUDIT_IMMUTABLE";

    @Override
    public void rejectAuditLogDeletion() {
        throw new UnsupportedOperationException(IMMUTABLE_ERROR + ": sys_audit_log delete is forbidden");
    }

    @Override
    public void rejectOperLogDeletion() {
        throw new UnsupportedOperationException(IMMUTABLE_ERROR + ": sys_log delete is forbidden");
    }

    @Override
    public void rejectLoginLogDeletion() {
        throw new UnsupportedOperationException(IMMUTABLE_ERROR + ": login log delete is forbidden");
    }
}
