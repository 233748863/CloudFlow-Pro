package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.crm.domain.CrmContact;
import com.cloudflow.crm.mapper.CrmContactMapper;
import com.cloudflow.crm.service.ICrmContactService;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
public class CrmContactServiceImpl extends CrmServiceSupport<CrmContactMapper, CrmContact>
        implements ICrmContactService {

    @Override
    public PageResult<CrmContact> queryPage(CrmContact query, PageQuery pageQuery) {
        LambdaQueryWrapper<CrmContact> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(CrmContact::getDeleted, "0").orderByDesc(CrmContact::getUpdateTime);
        eqIfPresent(wrapper, CrmContact::getCustomerId, query.getCustomerId());
        likeIfPresent(wrapper, CrmContact::getContactName, query.getContactName());
        eqIfPresent(wrapper, CrmContact::getStatus, query.getStatus());
        return pageResult(pageQuery, wrapper);
    }

    @Override
    public boolean createContact(CrmContact contact) {
        validate(contact);
        Localize.fillCommonAudit(contact, currentTenantId(), currentUserName(), now());
        return save(contact);
    }

    @Override
    public boolean updateContact(CrmContact contact) {
        if (contact == null || contact.getContactId() == null) {
            throw new IllegalArgumentException("联系人ID不能为空");
        }
        validate(contact);
        CrmContact persisted = requireById(contact.getContactId(), "联系人不存在");
        contact.setTenantId(persisted.getTenantId());
        contact.setUpdateBy(currentUserName());
        contact.setUpdateTime(now());
        return updateById(contact);
    }

    private void validate(CrmContact contact) {
        if (contact == null) {
            throw new IllegalArgumentException("联系人不能为空");
        }
        if (contact.getCustomerId() == null) {
            throw new IllegalArgumentException("客户ID不能为空");
        }
        if (!StringUtils.hasText(contact.getContactName())) {
            throw new IllegalArgumentException("联系人姓名不能为空");
        }
        if (!StringUtils.hasText(contact.getStatus())) {
            contact.setStatus("ACTIVE");
        }
    }
}
