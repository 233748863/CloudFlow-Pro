package com.cloudflow.crm.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.crm.domain.CrmFollowUp;
import java.util.List;

public interface ICrmFollowUpService extends IService<CrmFollowUp> {

    PageResult<CrmFollowUp> queryPage(CrmFollowUp query, PageQuery pageQuery);

    CrmFollowUp getAccessibleFollowUp(Long followUpId);

    boolean createFollowUp(CrmFollowUp followUp);

    boolean updateFollowUp(CrmFollowUp followUp);

    boolean removeFollowUps(List<Long> followUpIds);
}
