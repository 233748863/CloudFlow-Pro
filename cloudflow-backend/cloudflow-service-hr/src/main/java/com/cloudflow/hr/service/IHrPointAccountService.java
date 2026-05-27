package com.cloudflow.hr.service;

import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.hr.domain.dto.benefit.HrPointTransactionQueryDTO;
import com.cloudflow.hr.domain.entity.HrPointAccount;
import com.cloudflow.hr.domain.vo.benefit.HrPointAccountVO;
import com.cloudflow.hr.domain.vo.benefit.HrPointTransactionVO;

public interface IHrPointAccountService {

    HrPointAccount findOrCreateAccount(Long employeeId);

    HrPointAccountVO getMyAccount();

    HrPointAccountVO getEmployeeAccount(Long employeeId);

    PageResult<HrPointTransactionVO> listTransactions(Long accountId, HrPointTransactionQueryDTO query);

    Long credit(Long accountId, Integer points, String sourceType, Long sourceId, String remark);

    Long debit(Long accountId, Integer points, String sourceType, Long sourceId, String remark);

    Long freeze(Long accountId, Integer points, String sourceType, Long sourceId, String remark);

    Long unfreeze(Long accountId, Integer points, String sourceType, Long sourceId, String remark);

    Long manualAdjust(Long employeeId, Integer points, String direction, String remark);
}
