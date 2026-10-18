package com.cloudflow.crm.service.impl;

import com.cloudflow.crm.exception.CrmBusinessException;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.datascope.DataScopeUtils;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.CrmLead;
import com.cloudflow.crm.mapper.CrmCustomerMapper;
import com.cloudflow.crm.mapper.CrmLeadMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;
import java.util.Objects;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class CrmLeadQualificationService {
    private final CrmLeadMapper leads;
    private final CrmCustomerMapper customers;
    private final CrmReferenceService references;
    private final CrmAuditTrail audit;

    @Transactional(rollbackFor = Exception.class)
    public CrmLead qualify(Long id, String target, String explanation, Integer version) {
        references.lead(id);
        CrmLead lead = CrmRecordSupport.require(leads.lockById(id), "线索不存在");
        DataScopeUtils.assertOwnership(lead, CrmLead::getOwnerId, "线索");
        if (!Objects.equals(version, lead.getVersion())) throw new CrmBusinessException("线索已修改，请刷新后重试");
        if (lead.getConvertedCustomerId() != null) throw new CrmBusinessException("已转化线索不能重新评估");
        if (!Set.of("QUALIFYING", "QUALIFIED", "DISQUALIFIED").contains(target)) throw new CrmBusinessException("资质状态无效");
        if ("DISQUALIFIED".equals(lead.getQualificationStatus()) && "QUALIFIED".equals(target)) throw new CrmBusinessException("不合格线索须先重新开始评估");
        if ("DISQUALIFIED".equals(target)) explanation = CrmRecordSupport.text(explanation, 500, "不合格原因");
        else if (explanation != null && explanation.length() > 500) throw new CrmBusinessException("评估说明不能超过500字");
        boolean assessing = "QUALIFYING".equals(target);
        CrmRecordSupport.saved(leads.update(null, new LambdaUpdateWrapper<CrmLead>().eq(CrmLead::getLeadId, id).eq(CrmLead::getVersion, version)
                .set(CrmLead::getQualificationStatus, target).set(CrmLead::getQualifiedBy, assessing ? null : UserContext.getUserId())
                .set(CrmLead::getQualifiedByName, assessing ? null : CrmRecordSupport.userName()).set(CrmLead::getQualifiedTime, assessing ? null : LocalDateTime.now())
                .set(CrmLead::getDisqualifyReason, "DISQUALIFIED".equals(target) ? explanation : null)
                .set(CrmLead::getVersion, version + 1).set(CrmLead::getUpdateBy, CrmRecordSupport.userName()).set(CrmLead::getUpdateTime, LocalDateTime.now())));
        audit.record("CRM_LEAD_QUALIFICATION", "CRM_LEAD:" + id, lead.getQualificationStatus() + "→" + target + ";" + explanation, true);
        return leads.selectById(id);
    }

    @Transactional(rollbackFor = Exception.class)
    public void unsubscribeLead(Long id, Integer flag, Integer version) {
        CrmLead lead = references.lead(id);
        DataScopeUtils.assertOwnership(lead, CrmLead::getOwnerId, "线索");
        int value = CrmRecordSupport.flag(flag);
        if (!Objects.equals(version, lead.getVersion())) throw new CrmBusinessException("线索已修改，请刷新后重试");
        CrmRecordSupport.saved(leads.update(null, new LambdaUpdateWrapper<CrmLead>().eq(CrmLead::getLeadId, id).eq(CrmLead::getVersion, version)
                .set(CrmLead::getUnsubscribeFlag, value).set(CrmLead::getUnsubscribeTime, value == 1 ? LocalDateTime.now() : null)
                .set(CrmLead::getVersion, version + 1).set(CrmLead::getUpdateBy, CrmRecordSupport.userName()).set(CrmLead::getUpdateTime, LocalDateTime.now())));
        audit.record("CRM_MARKETING_CONSENT", "CRM_LEAD:" + id, "退订=" + value, true);
    }

    @Transactional(rollbackFor = Exception.class)
    public void unsubscribeCustomer(Long id, Integer flag, Integer version) {
        CrmCustomer customer = references.customer(id);
        DataScopeUtils.assertOwnership(customer, CrmCustomer::getOwnerId, "客户");
        if (!Objects.equals(version, customer.getVersion())) throw new CrmBusinessException("客户已修改，请刷新后重试");
        int value = CrmRecordSupport.flag(flag);
        CrmRecordSupport.saved(customers.update(null, new LambdaUpdateWrapper<CrmCustomer>().eq(CrmCustomer::getCustomerId, id).eq(CrmCustomer::getVersion, version)
                .set(CrmCustomer::getUnsubscribeFlag, value).set(CrmCustomer::getVersion, version + 1)
                .set(CrmCustomer::getUpdateBy, CrmRecordSupport.userName()).set(CrmCustomer::getUpdateTime, LocalDateTime.now())));
        audit.record("CRM_MARKETING_CONSENT", "CRM_CUSTOMER:" + id, "退订=" + value, true);
    }
}
