package com.cloudflow.oa.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.oa.domain.OaSealRenewal;

import java.util.List;

/**
 * 印章续期申请服务。
 */
public interface IOaSealRenewalService extends IService<OaSealRenewal> {

    PageResult<OaSealRenewal> queryPage(OaSealRenewal query, PageQuery pageQuery);

    OaSealRenewal getRenewalInfo(Long id);

    String generateRenewalNo();

    boolean createRenewal(OaSealRenewal renewal);

    boolean updateRenewal(OaSealRenewal renewal);

    boolean removeRenewals(List<Long> ids);

    boolean submitRenewal(Long id);

    boolean cancelRenewal(Long id);

    void approveRenewal(Long id, String processInstanceId);

    void rejectRenewal(Long id, String processInstanceId);
}
