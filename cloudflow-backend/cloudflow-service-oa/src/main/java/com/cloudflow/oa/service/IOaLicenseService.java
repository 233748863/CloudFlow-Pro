package com.cloudflow.oa.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.oa.domain.OaLicenseExpiryReminderLog;
import com.cloudflow.oa.domain.OaLicense;

import java.util.List;

/**
 * 证照台账服务。
 */
public interface IOaLicenseService extends IService<OaLicense> {

    PageResult<OaLicense> queryPage(OaLicense query, PageQuery pageQuery);

    List<OaLicense> listAvailable();

    OaLicense getLicenseInfo(Long id);

    PageResult<OaLicense> queryExpiringPage(Integer days, PageQuery pageQuery);

    List<OaLicenseExpiryReminderLog> listExpiryReminderLogs(Long licenseId);

    boolean remindExpiry(Long licenseId, String remark);

    int scanAndRemindExpiring();

    boolean createLicense(OaLicense license);

    boolean updateLicense(OaLicense license);

    boolean removeLicenses(List<Long> ids);
}
