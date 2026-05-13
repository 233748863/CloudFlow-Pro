package com.cloudflow.crm.service;

import com.cloudflow.crm.domain.vo.CrmCustomerWorkspaceVO;
import com.cloudflow.crm.domain.vo.CrmDashboardSummaryVO;
import com.cloudflow.crm.domain.vo.CrmDashboardWorkplaceVO;

/**
 * 客户工作台聚合与 CRM Dashboard。
 * 面向"查询 + 只读聚合"，不承载业务流转写操作。
 */
public interface ICrmCustomerWorkspaceService {

    CrmCustomerWorkspaceVO getWorkspace(Long customerId);

    CrmDashboardSummaryVO getDashboardSummary();

    CrmDashboardWorkplaceVO getDashboardWorkplace();
}
