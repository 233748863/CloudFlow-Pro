package com.cloudflow.crm.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.vo.CrmCustomerWorkspaceVO;
import com.cloudflow.crm.domain.vo.CrmDashboardSummaryVO;

public interface ICrmCustomerService extends IService<CrmCustomer> {

    PageResult<CrmCustomer> queryPage(CrmCustomer query, PageQuery pageQuery);

    boolean createCustomer(CrmCustomer customer);

    boolean updateCustomer(CrmCustomer customer);

    void refreshHealth(Long customerId);

    CrmCustomerWorkspaceVO getWorkspace(Long customerId);

    CrmDashboardSummaryVO getDashboardSummary();
}
