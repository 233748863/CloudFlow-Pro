package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.datascope.DataScopeUtils;
import com.cloudflow.crm.constant.CrmConstants;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.CrmLead;
import com.cloudflow.crm.domain.dto.CrmLeadConvertDTO;
import com.cloudflow.crm.domain.vo.HrEmployeeSummaryVO;
import com.cloudflow.crm.mapper.CrmCustomerMapper;
import com.cloudflow.crm.mapper.CrmLeadMapper;
import com.cloudflow.crm.service.ICrmCustomerService;
import com.cloudflow.crm.service.ICrmLeadService;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.redis.lock.DistributedLock;
import com.cloudflow.common.statemachine.core.StateMachine;
import com.cloudflow.common.statemachine.core.StateMachineRegistry;
import com.cloudflow.crm.enums.CrmLeadStatus;
import com.cloudflow.crm.enums.CrmLeadEvent;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.crm.event.LeadConvertedEvent;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
@RequiredArgsConstructor
public class CrmLeadServiceImpl extends CrmServiceSupport<CrmLeadMapper, CrmLead>
        implements ICrmLeadService {

    private final ICrmCustomerService crmCustomerService;
    private final CrmCustomerMapper customerMapper;
    private final StateMachineRegistry stateMachineRegistry;
    private final OutboxPublisher outboxPublisher;
    private final ObjectMapper objectMapper;
    private final CrmProfileService profiles;
    private final CrmLeadScoreService scores;
    private final CrmRuleService rules;
    private final CrmReferenceService references;
    private final CrmAuditTrail audit;
    private final com.cloudflow.crm.service.ICrmContactService contacts;
    private final com.cloudflow.crm.service.ICrmOpportunityService opportunities;

    @Override
    public PageResult<CrmLead> queryPage(CrmLead query, PageQuery pageQuery) {
        return PageResult.build(baseMapper.selectPageByDataScope(
                pageQuery.build(), query, DataScopeUtils.listScope("dept_id", "owner_id")));
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean createLead(CrmLead lead) {
        validate(lead);
        CrmRecordSupport.create(lead, "leadId");
        lead.setQualificationStatus("UNQUALIFIED"); lead.setQualifiedBy(null); lead.setQualifiedByName(null);
        lead.setQualifiedTime(null); lead.setDisqualifyReason(null); lead.setConvertedCustomerId(null); lead.setConvertedTime(null);
        lead.setStatus(CrmConstants.LeadStatus.NEW);
        fillOwner(lead);
        lead.setUnsubscribeFlag(CrmRecordSupport.flag(lead.getUnsubscribeFlag()));
        lead.setUnsubscribeTime(lead.getUnsubscribeFlag() == 1 ? now() : null);
        scores.score(lead);
        boolean saved = save(lead);
        if (saved && lead.getUnsubscribeFlag() == 1) audit.record("CRM_MARKETING_CONSENT", "CRM_LEAD:" + lead.getLeadId(), "退订=1", true);
        return saved;
    }

    @Override
    @Audit(name = "更新线索")
    @Transactional(rollbackFor = Exception.class)
    public boolean updateLead(CrmLead lead) {
        if (lead == null || lead.getLeadId() == null) {
            throw new IllegalArgumentException("线索ID不能为空");
        }
        validate(lead);
        CrmLead persisted = references.lead(lead.getLeadId());
        CrmRecordSupport.update(lead, persisted);
        lead.setQualificationStatus(persisted.getQualificationStatus()); lead.setQualifiedBy(persisted.getQualifiedBy());
        lead.setQualifiedByName(persisted.getQualifiedByName()); lead.setQualifiedTime(persisted.getQualifiedTime());
        lead.setDisqualifyReason(persisted.getDisqualifyReason());
        if (lead.getOwnerId() == null) lead.setOwnerId(persisted.getOwnerId());
        if (!java.util.Objects.equals(lead.getOwnerId(), persisted.getOwnerId()) && !cn.dev33.satoken.stp.StpUtil.hasPermission("crm:lead:assign")) {
            throw new IllegalArgumentException("无权调整线索负责人");
        }
        fillOwner(lead);
        if (lead.getUnsubscribeFlag() == null) lead.setUnsubscribeFlag(persisted.getUnsubscribeFlag());
        lead.setUnsubscribeFlag(CrmRecordSupport.flag(lead.getUnsubscribeFlag()));
        boolean consentChanged = !java.util.Objects.equals(lead.getUnsubscribeFlag(), persisted.getUnsubscribeFlag());
        lead.setUnsubscribeTime(lead.getUnsubscribeFlag() == 1 ? consentChanged ? now() : persisted.getUnsubscribeTime() : null);
        scores.score(lead);
        // M1-4: 所有权校验
        DataScopeUtils.assertOwnership(persisted, CrmLead::getOwnerId, "线索");
        lead.setTenantId(persisted.getTenantId());
        lead.setLeadNo(persisted.getLeadNo());
        if (persisted.getConvertedCustomerId() != null) {
            lead.setConvertedCustomerId(persisted.getConvertedCustomerId());
            lead.setConvertedTime(persisted.getConvertedTime());
            lead.setStatus(CrmConstants.LeadStatus.CONVERTED);
        }
        lead.setUpdateBy(currentUserName());
        lead.setUpdateTime(now());
        boolean updated = updateById(lead);
        if (updated) {
            baseMapper.update(null, new com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper<CrmLead>()
                    .eq(CrmLead::getLeadId, lead.getLeadId()).set(CrmLead::getTerritoryId, lead.getTerritoryId())
                    .set(CrmLead::getMarketSegment, lead.getMarketSegment()).set(CrmLead::getEmployeeScale, lead.getEmployeeScale())
                    .set(CrmLead::getAnnualRevenue, lead.getAnnualRevenue()).set(CrmLead::getCampaignId, lead.getCampaignId())
                    .set(CrmLead::getUnsubscribeTime, lead.getUnsubscribeTime()));
            if (consentChanged) audit.record("CRM_MARKETING_CONSENT", "CRM_LEAD:" + lead.getLeadId(), "退订=" + lead.getUnsubscribeFlag(), true);
        }
        return updated;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    // M1-5: 防并发冲突
    @DistributedLock(key = "'lead:' + #request.leadId")
    public Long convertLead(CrmLeadConvertDTO request) {
        if (request == null || request.getLeadId() == null) {
            throw new IllegalArgumentException("线索ID不能为空");
        }
        references.lead(request.getLeadId());
        CrmLead lead = CrmRecordSupport.require(baseMapper.lockById(request.getLeadId()), "线索不存在");
        // M1-4: 所有权校验
        DataScopeUtils.assertOwnership(lead, CrmLead::getOwnerId, "线索");
        if (!CrmConstants.DelFlag.NORMAL.equals(lead.getDeleted())) {
            throw new IllegalArgumentException("线索不存在");
        }
        if (lead.getConvertedCustomerId() != null) {
            return lead.getConvertedCustomerId();
        }
        rules.evaluate("crm.lead.qualify.required", "BLOCK", "CRM_LEAD_CONVERT", lead.getLeadId(),
                "QUALIFIED".equals(lead.getQualificationStatus()) ? java.math.BigDecimal.ZERO : java.math.BigDecimal.ONE,
                java.math.BigDecimal.ZERO, false, "线索尚未通过资质评估，请先完成评估");

        StateMachine<CrmLeadStatus, CrmLeadEvent> stateMachine = stateMachineRegistry.require("CrmLead");
        CrmLeadStatus currentStatus = CrmLeadStatus.valueOf(lead.getStatus());
        CrmLeadStatus newStatus = stateMachine.fire(currentStatus, CrmLeadEvent.CONVERT);

        CrmCustomer customer = new CrmCustomer();
        customer.setCustomerName(StringUtils.hasText(request.getCustomerName()) ? request.getCustomerName() : defaultCustomerName(lead));
        customer.setCustomerType(request.getCustomerType());
        customer.setIndustry(StringUtils.hasText(request.getIndustry()) ? request.getIndustry() : lead.getIndustry());
        customer.setSource(StringUtils.hasText(request.getSource()) ? request.getSource() : lead.getSource());
        customer.setCustomerTags(request.getCustomerTags());
        customer.setOwnerId(request.getOwnerId() != null ? request.getOwnerId() : lead.getOwnerId());
        customer.setOwnerName(StringUtils.hasText(request.getOwnerName()) ? request.getOwnerName() : lead.getOwnerName());
        customer.setDeptId(lead.getDeptId());
        customer.setDeptName(lead.getDeptName());
        customer.setPhone(StringUtils.hasText(request.getPhone()) ? request.getPhone() : firstNonBlank(lead.getMobile(), lead.getPhone()));
        customer.setEmail(StringUtils.hasText(request.getEmail()) ? request.getEmail() : lead.getEmail());
        customer.setWebsite(StringUtils.hasText(request.getWebsite()) ? request.getWebsite() : lead.getWebsite());
        customer.setProvince(request.getProvince());
        customer.setCity(request.getCity());
        customer.setAddress(request.getAddress());
        customer.setCreditCode(request.getCreditCode());
        customer.setRemark(buildConvertedRemark(lead, request.getRemark()));
        CrmProfileService.mapLeadToCustomer(lead, customer);
        crmCustomerService.createCustomer(customer);

        CrmCustomer persistedCustomer = customerMapper.selectPage(new Page<>(1, 1, false), new LambdaQueryWrapper<CrmCustomer>()
                .eq(CrmCustomer::getTenantId, currentTenantId())
                .eq(CrmCustomer::getCustomerCode, customer.getCustomerCode()))
                .getRecords().stream().findFirst().orElse(null);
        if (persistedCustomer == null || persistedCustomer.getCustomerId() == null) {
            throw new IllegalStateException("线索转客户失败");
        }
        com.cloudflow.crm.domain.CrmContact contact = new com.cloudflow.crm.domain.CrmContact();
        if (StringUtils.hasText(lead.getContactName())) {
            contact.setCustomerId(persistedCustomer.getCustomerId()); contact.setContactName(lead.getContactName());
            contact.setMobile(lead.getMobile()); contact.setPhone(lead.getPhone()); contact.setEmail(lead.getEmail());
            contact.setPosition(lead.getJobTitle()); contact.setPrimaryFlag(1);
            if (!contacts.createContact(contact)) throw new IllegalStateException("转化联系人创建失败");
        }
        if (Boolean.TRUE.equals(request.getCreateOpportunity())) {
            com.cloudflow.crm.domain.CrmOpportunity opportunity = new com.cloudflow.crm.domain.CrmOpportunity();
            opportunity.setCustomerId(persistedCustomer.getCustomerId()); opportunity.setContactId(contact.getContactId());
            opportunity.setContactName(contact.getContactName()); opportunity.setCampaignId(lead.getCampaignId());
            opportunity.setSource(lead.getSource()); opportunity.setOwnerId(persistedCustomer.getOwnerId());
            opportunity.setOpportunityName(StringUtils.hasText(request.getOpportunityName()) ? request.getOpportunityName() : lead.getLeadName());
            opportunity.setExpectedAmount(CrmRecordSupport.money(request.getExpectedAmount(), "预计金额"));
            opportunity.setExpectedSignDate(request.getExpectedSignDate());
            if (!opportunities.createOpportunity(opportunity)) throw new IllegalStateException("转化商机创建失败");
        }

        lead.setConvertedCustomerId(persistedCustomer.getCustomerId());
        lead.setConvertedTime(now());

        // M1-6: 使用状态机进行状态转换
        lead.setStatus(newStatus.name());

        lead.setUpdateBy(currentUserName());
        lead.setUpdateTime(now());
        if (!updateById(lead)) throw new IllegalStateException("线索已修改，转化已回滚");

        // M1-7: 发布事件到 Outbox
        LeadConvertedEvent event = new LeadConvertedEvent();
        event.setLeadId(lead.getLeadId());
        event.setLeadNo(lead.getLeadNo());
        event.setLeadName(lead.getLeadName());
        event.setCustomerId(persistedCustomer.getCustomerId());
        event.setCustomerName(persistedCustomer.getCustomerName());
        event.setCustomerType(persistedCustomer.getCustomerType());
        event.setOriginalOwnerId(lead.getOwnerId());
        event.setOriginalOwnerName(lead.getOwnerName());
        event.setNewOwnerId(persistedCustomer.getOwnerId());
        event.setNewOwnerName(persistedCustomer.getOwnerName());
        event.setConvertedAt(now());

        try {
            BusinessEventEnvelope envelope = BusinessEventEnvelope.builder()
                    .eventType("LEAD_CONVERTED")
                    .sourceModule("cloudflow-crm")
                    .sourceId(lead.getLeadId())
                    .tenantId(CrmRecordSupport.tenantId())
                    .payload(objectMapper.writeValueAsString(event))
                    .build();
            outboxPublisher.publish(envelope);
        } catch (Exception e) {
            throw new IllegalStateException("线索转化事件发布失败", e);
        }

        return persistedCustomer.getCustomerId();
    }

    private void validate(CrmLead lead) {
        if (lead == null) {
            throw new IllegalArgumentException("线索不能为空");
        }
        if (!StringUtils.hasText(lead.getLeadName())) {
            throw new IllegalArgumentException("线索名称不能为空");
        }
        profiles.validate(lead.getTerritoryId(), lead.getMarketSegment(), lead.getEmployeeScale(), lead.getAnnualRevenue(), lead.getCampaignId());
        if (!StringUtils.hasText(lead.getLeadNo())) {
            lead.setLeadNo(Localize.nextNo(CrmConstants.NoPrefix.LEAD));
        }
        if (!StringUtils.hasText(lead.getStatus())) {
            lead.setStatus(CrmConstants.LeadStatus.NEW);
        }
    }

    private String defaultCustomerName(CrmLead lead) {
        return StringUtils.hasText(lead.getCompanyName()) ? lead.getCompanyName() : lead.getLeadName();
    }

    private void fillOwner(CrmLead lead) {
        Long currentId = com.cloudflow.common.core.context.UserContext.getUserId();
        if (lead.getOwnerId() == null) lead.setOwnerId(currentId);
        if (java.util.Objects.equals(lead.getOwnerId(), currentId)) {
            lead.setOwnerName(currentUserName()); lead.setDeptId(com.cloudflow.common.core.context.UserContext.getDeptId());
            lead.setDeptName(com.cloudflow.common.core.context.UserContext.getDeptName());
        } else {
            if (lead.getLeadId() == null && !cn.dev33.satoken.stp.StpUtil.hasPermission("crm:lead:assign")) throw new IllegalArgumentException("无权给他人创建线索");
            HrEmployeeSummaryVO owner = references.user(lead.getOwnerId()); lead.setOwnerName(owner.getEmployeeName()); lead.setDeptId(owner.getDeptId()); lead.setDeptName(owner.getDeptName());
        }
    }

    private String firstNonBlank(String first, String second) {
        if (StringUtils.hasText(first)) {
            return first;
        }
        return StringUtils.hasText(second) ? second : null;
    }

    private String buildConvertedRemark(CrmLead lead, String remark) {
        String leadRemark = StringUtils.hasText(lead.getRemark()) ? lead.getRemark() : null;
        if (!StringUtils.hasText(remark)) {
            return leadRemark;
        }
        if (!StringUtils.hasText(leadRemark)) {
            return remark;
        }
        return leadRemark + "；" + remark;
    }
}
