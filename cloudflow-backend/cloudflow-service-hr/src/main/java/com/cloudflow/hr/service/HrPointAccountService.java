package com.cloudflow.hr.service;

import com.cloudflow.hr.domain.entity.HrPointAccount;

import java.util.Map;

public interface HrPointAccountService {

    HrPointAccount findOrCreateAccount(Long employeeId);

    Map<String, Object> getMyAccount();

    Map<String, Object> getEmployeeAccount(Long employeeId);

    Map<String, Object> listTransactions(Long accountId, Map<String, Object> query);

    Long credit(Long accountId, Integer points, String sourceType, Long sourceId, String remark);

    Long debit(Long accountId, Integer points, String sourceType, Long sourceId, String remark);

    Long freeze(Long accountId, Integer points, String sourceType, Long sourceId, String remark);

    Long unfreeze(Long accountId, Integer points, String sourceType, Long sourceId, String remark);

    Long manualAdjust(Long employeeId, Integer points, String direction, String remark);
}
