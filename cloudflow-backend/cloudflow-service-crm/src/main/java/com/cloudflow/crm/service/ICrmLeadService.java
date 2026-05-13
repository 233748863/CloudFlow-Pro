package com.cloudflow.crm.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.crm.domain.CrmLead;
import com.cloudflow.crm.domain.dto.CrmLeadConvertDTO;

public interface ICrmLeadService extends IService<CrmLead> {

    PageResult<CrmLead> queryPage(CrmLead query, PageQuery pageQuery);

    boolean createLead(CrmLead lead);

    boolean updateLead(CrmLead lead);

    Long convertLead(CrmLeadConvertDTO request);
}
