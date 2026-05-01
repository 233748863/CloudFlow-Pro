package com.cloudflow.oa.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.oa.domain.OaLicenseRenewal;

import java.util.List;

/**
 * 证照续期申请服务。
 */
public interface IOaLicenseRenewalService extends IService<OaLicenseRenewal> {

    PageResult<OaLicenseRenewal> queryPage(OaLicenseRenewal query, PageQuery pageQuery);

    OaLicenseRenewal getRenewalInfo(Long id);

    String generateRenewalNo();

    boolean createRenewal(OaLicenseRenewal renewal);

    boolean updateRenewal(OaLicenseRenewal renewal);

    boolean removeRenewals(List<Long> ids);

    boolean submitRenewal(Long id);

    boolean cancelRenewal(Long id);

    void approveRenewal(Long id, String processInstanceId);

    void rejectRenewal(Long id, String processInstanceId);
}
