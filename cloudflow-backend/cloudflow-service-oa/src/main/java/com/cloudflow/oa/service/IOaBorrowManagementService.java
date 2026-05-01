package com.cloudflow.oa.service;

import com.cloudflow.oa.domain.dto.OaBorrowManagementStatsDTO;
import com.cloudflow.oa.domain.dto.OaBorrowManagementSummaryDTO;

/**
 * 借还管理聚合服务。
 */
public interface IOaBorrowManagementService {

    OaBorrowManagementSummaryDTO getSummary();

    OaBorrowManagementStatsDTO getStats();
}
