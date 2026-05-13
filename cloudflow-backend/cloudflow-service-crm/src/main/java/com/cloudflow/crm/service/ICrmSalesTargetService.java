package com.cloudflow.crm.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.crm.domain.CrmSalesTarget;

public interface ICrmSalesTargetService extends IService<CrmSalesTarget> {

    PageResult<CrmSalesTarget> queryPage(CrmSalesTarget query, PageQuery pageQuery);

    boolean createSalesTarget(CrmSalesTarget salesTarget);

    boolean updateSalesTarget(CrmSalesTarget salesTarget);
}
