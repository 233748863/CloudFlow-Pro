package com.cloudflow.auth.service;

public interface LogImmutabilityGuardService {

    void rejectAuditLogDeletion();

    void rejectOperLogDeletion();

    void rejectLoginLogDeletion();
}
