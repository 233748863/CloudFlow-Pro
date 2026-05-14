package com.cloudflow.crm.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.crm.domain.CrmCustomer;

/**
 * 客户域服务，仅负责 CrmCustomer 本身的 CRUD 与健康度刷新。
 *
 * <p>工作台聚合、Dashboard 请使用 {@link ICrmCustomerWorkspaceService}；
 * 跨模块调 OA 的草稿 / 绑定 / 作废 / 回款确认请使用 {@link ICrmCrossModuleDraftService}。
 */
public interface ICrmCustomerService extends IService<CrmCustomer> {

    PageResult<CrmCustomer> queryPage(CrmCustomer query, PageQuery pageQuery);

    CrmCustomer getAccessibleCustomer(Long customerId);

    boolean createCustomer(CrmCustomer customer);

    boolean updateCustomer(CrmCustomer customer);

    void refreshHealth(Long customerId);
}
