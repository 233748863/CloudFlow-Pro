package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.datascope.DataScopeUtils;
import com.cloudflow.crm.constant.CrmConstants;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.CrmLead;
import com.cloudflow.crm.domain.dto.CrmLeadConvertDTO;
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

    @Override
    public PageResult<CrmLead> queryPage(CrmLead query, PageQuery pageQuery) {
        LambdaQueryWrapper<CrmLead> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(CrmLead::getDeleted, CrmConstants.DelFlag.NORMAL)
                .orderByDesc(CrmLead::getUpdateTime);
        likeIfPresent(wrapper, CrmLead::getLeadName, query.getLeadName());
        likeIfPresent(wrapper, CrmLead::getCompanyName, query.getCompanyName());
        likeIfPresent(wrapper, CrmLead::getContactName, query.getContactName());
        likeIfPresent(wrapper, CrmLead::getMobile, query.getMobile());
        eqIfPresent(wrapper, CrmLead::getStatus, query.getStatus());
        eqIfPresent(wrapper, CrmLead::getOwnerId, query.getOwnerId());
        return pageResult(pageQuery, wrapper);
    }

    @Override
    public boolean createLead(CrmLead lead) {
        validate(lead);
        Localize.fillCommonAudit(lead, currentTenantId(), currentUserName(), now());
        return save(lead);
    }

    @Override
    @Audit(name = "更新线索")
    public boolean updateLead(CrmLead lead) {
        if (lead == null || lead.getLeadId() == null) {
            throw new IllegalArgumentException("线索ID不能为空");
        }
        validate(lead);
        CrmLead persisted = requireById(lead.getLeadId(), "线索不存在");
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
        return updateById(lead);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    // M1-5: 防并发冲突
    @DistributedLock(key = "'lead:' + #request.leadId")
    public Long convertLead(CrmLeadConvertDTO request) {
        if (request == null || request.getLeadId() == null) {
            throw new IllegalArgumentException("线索ID不能为空");
        }
        CrmLead lead = requireById(request.getLeadId(), "线索不存在");
        // M1-4: 所有权校验
        DataScopeUtils.assertOwnership(lead, CrmLead::getOwnerId, "线索");
        if (!CrmConstants.DelFlag.NORMAL.equals(lead.getDeleted())) {
            throw new IllegalArgumentException("线索不存在");
        }
        if (lead.getConvertedCustomerId() != null) {
            return lead.getConvertedCustomerId();
        }

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
        customer.setWebsite(request.getWebsite());
        customer.setProvince(request.getProvince());
        customer.setCity(request.getCity());
        customer.setAddress(request.getAddress());
        customer.setCreditCode(request.getCreditCode());
        customer.setRemark(buildConvertedRemark(lead, request.getRemark()));
        crmCustomerService.createCustomer(customer);

        CrmCustomer persistedCustomer = customerMapper.selectOne(new LambdaQueryWrapper<CrmCustomer>()
                .eq(CrmCustomer::getTenantId, currentTenantId())
                .eq(CrmCustomer::getCustomerCode, customer.getCustomerCode())
                .last("limit 1"));
        if (persistedCustomer == null || persistedCustomer.getCustomerId() == null) {
            throw new IllegalStateException("线索转客户失败");
        }

        lead.setConvertedCustomerId(persistedCustomer.getCustomerId());
        lead.setConvertedTime(now());

        // M1-6: 使用状态机进行状态转换
        StateMachine<CrmLeadStatus, CrmLeadEvent> stateMachine = stateMachineRegistry.require("CrmLead");
        CrmLeadStatus currentStatus = CrmLeadStatus.valueOf(lead.getStatus());
        CrmLeadStatus newStatus = stateMachine.fire(currentStatus, CrmLeadEvent.CONVERT);
        lead.setStatus(newStatus.name());

        lead.setUpdateBy(currentUserName());
        lead.setUpdateTime(now());
        updateById(lead);

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
                    .payload(objectMapper.writeValueAsString(event))
                    .build();
            outboxPublisher.publish(envelope);
        } catch (Exception e) {
            log.warn("线索转客户事件发布失败, leadId=" + lead.getLeadId() + ", error=" + e.getMessage());
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
