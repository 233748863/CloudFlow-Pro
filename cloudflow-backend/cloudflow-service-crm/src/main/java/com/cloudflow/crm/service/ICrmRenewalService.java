package com.cloudflow.crm.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.crm.domain.CrmRenewal;

public interface ICrmRenewalService extends IService<CrmRenewal> {

    PageResult<CrmRenewal> queryPage(CrmRenewal query, PageQuery pageQuery);

    CrmRenewal getRenewalInfo(Long renewalId);

    CrmRenewal getAccessibleRenewal(Long renewalId);

    boolean createRenewal(CrmRenewal renewal);

    boolean updateRenewal(CrmRenewal renewal);

    boolean submitRenewal(Long renewalId);
}
