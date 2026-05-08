package com.cloudflow.crm.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.crm.domain.CrmContact;

public interface ICrmContactService extends IService<CrmContact> {

    PageResult<CrmContact> queryPage(CrmContact query, PageQuery pageQuery);

    boolean createContact(CrmContact contact);

    boolean updateContact(CrmContact contact);
}
