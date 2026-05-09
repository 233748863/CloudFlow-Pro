package com.cloudflow.oa.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.oa.domain.OaSeal;
import com.cloudflow.oa.domain.OaSealExpiryReminderLog;

import java.util.List;

/**
 * 印章台账服务。
 */
public interface IOaSealService extends IService<OaSeal> {

    PageResult<OaSeal> queryPage(OaSeal query, PageQuery pageQuery);

    List<OaSeal> listAvailable();

    OaSeal getSealInfo(Long id);

    PageResult<OaSeal> queryExpiringPage(Integer days, PageQuery pageQuery);

    List<OaSealExpiryReminderLog> listExpiryReminderLogs(Long sealId);

    boolean remindExpiry(Long sealId, String remark);

    int scanAndRemindExpiring();

    boolean createSeal(OaSeal seal);

    boolean updateSeal(OaSeal seal);

    boolean removeSeals(List<Long> ids);
}
