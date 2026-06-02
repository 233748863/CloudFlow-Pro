package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.crm.constant.CrmConstants;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.CrmHandoverTask;
import com.cloudflow.crm.domain.CrmLead;
import com.cloudflow.crm.domain.CrmOpportunity;
import com.cloudflow.crm.domain.CrmQuote;
import com.cloudflow.crm.domain.CrmReceivable;
import com.cloudflow.crm.domain.CrmRenewal;
import com.cloudflow.crm.domain.CrmServiceTicket;
import com.cloudflow.crm.mapper.CrmCustomerMapper;
import com.cloudflow.crm.mapper.CrmHandoverTaskMapper;
import com.cloudflow.crm.mapper.CrmOpportunityMapper;
import com.cloudflow.crm.mapper.CrmLeadMapper;
import com.cloudflow.crm.mapper.CrmQuoteMapper;
import com.cloudflow.crm.mapper.CrmReceivableMapper;
import com.cloudflow.crm.mapper.CrmRenewalMapper;
import com.cloudflow.crm.mapper.CrmServiceTicketMapper;
import com.cloudflow.crm.service.ICrmHandoverTaskService;
import com.cloudflow.crm.service.remote.RemoteHrService;
import com.cloudflow.crm.domain.vo.HrEmployeeSummaryVO;
import com.cloudflow.common.audit.annotation.Audit;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * 离职员工的交接待办生成与处理。
 *
 * <p>幂等：按 (businessType, businessId, fromOwnerId, status=PENDING) 唯一键去重，
 * 事件重复投递时通过 {@code insertOrSkip} 跳过已存在记录。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CrmHandoverTaskServiceImpl implements ICrmHandoverTaskService {

    private static final long DEFAULT_TENANT_ID = 100000L;

    private final CrmHandoverTaskMapper handoverTaskMapper;
    private final CrmLeadMapper leadMapper;
    private final CrmCustomerMapper customerMapper;
    private final CrmOpportunityMapper opportunityMapper;
    private final CrmQuoteMapper quoteMapper;
    private final CrmReceivableMapper receivableMapper;
    private final CrmRenewalMapper renewalMapper;
    private final CrmServiceTicketMapper serviceTicketMapper;
    private final RemoteHrService remoteHrService;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public int generateForEmployeeLeft(Long fromOwnerUserId, String fromOwnerName, Long fromDeptId, String eventId,
                                       Long successorUserId) {
        if (fromOwnerUserId == null) {
            return 0;
        }
        String successorOwnerName = resolveSuccessorName(successorUserId);
        if (successorUserId != null && StringUtils.hasText(successorOwnerName)) {
            return autoReassignAll(fromOwnerUserId, fromOwnerName, fromDeptId, eventId, successorUserId, successorOwnerName);
        }
        List<CrmHandoverTask> pending = new ArrayList<>();

        List<CrmCustomer> customers = customerMapper.selectList(new LambdaQueryWrapper<CrmCustomer>()
                .eq(CrmCustomer::getDeleted, CrmConstants.DelFlag.NORMAL)
                .eq(CrmCustomer::getOwnerId, fromOwnerUserId));
        for (CrmCustomer customer : customers) {
            pending.add(buildTask("CRM_CUSTOMER", customer.getCustomerId(), customer.getCustomerName(),
                    fromOwnerUserId, fromOwnerName, fromDeptId, eventId));
        }

        List<CrmOpportunity> opportunities = opportunityMapper.selectList(new LambdaQueryWrapper<CrmOpportunity>()
                .eq(CrmOpportunity::getDeleted, CrmConstants.DelFlag.NORMAL)
                .eq(CrmOpportunity::getOwnerId, fromOwnerUserId)
                .notIn(CrmOpportunity::getStage,
                        CrmConstants.OpportunityStage.WON,
                        CrmConstants.OpportunityStage.LOST));
        for (CrmOpportunity opportunity : opportunities) {
            pending.add(buildTask("CRM_OPPORTUNITY", opportunity.getOpportunityId(), opportunity.getOpportunityName(),
                    fromOwnerUserId, fromOwnerName, fromDeptId, eventId));
        }

        int created = 0;
        for (CrmHandoverTask task : pending) {
            if (existsPending(task.getBusinessType(), task.getBusinessId(), task.getFromOwnerId())) {
                continue;
            }
            handoverTaskMapper.insert(task);
            created++;
        }
        log.info("员工离职交接任务已生成: userId={}, 客户 {} 条, 商机 {} 条, 新增 {} 条",
                fromOwnerUserId, customers.size(), opportunities.size(), created);
        return created;
    }

    private int autoReassignAll(Long fromOwnerUserId, String fromOwnerName, Long fromDeptId, String eventId,
                                Long successorUserId, String successorOwnerName) {
        int updated = 0;
        updated += updateOwner(leadMapper, new LambdaUpdateWrapper<CrmLead>()
                .eq(CrmLead::getOwnerId, fromOwnerUserId)
                .eq(CrmLead::getDeleted, CrmConstants.DelFlag.NORMAL)
                .set(CrmLead::getOwnerId, successorUserId)
                .set(CrmLead::getOwnerName, successorOwnerName)
                .set(CrmLead::getUpdateTime, LocalDateTime.now())
                .set(CrmLead::getUpdateBy, "hr-employee-left"));
        updated += updateOwner(customerMapper, new LambdaUpdateWrapper<CrmCustomer>()
                .eq(CrmCustomer::getOwnerId, fromOwnerUserId)
                .eq(CrmCustomer::getDeleted, CrmConstants.DelFlag.NORMAL)
                .set(CrmCustomer::getOwnerId, successorUserId)
                .set(CrmCustomer::getOwnerName, successorOwnerName)
                .set(CrmCustomer::getUpdateTime, LocalDateTime.now())
                .set(CrmCustomer::getUpdateBy, "hr-employee-left"));
        updated += updateOwner(opportunityMapper, new LambdaUpdateWrapper<CrmOpportunity>()
                .eq(CrmOpportunity::getOwnerId, fromOwnerUserId)
                .eq(CrmOpportunity::getDeleted, CrmConstants.DelFlag.NORMAL)
                .notIn(CrmOpportunity::getStage, CrmConstants.OpportunityStage.WON, CrmConstants.OpportunityStage.LOST)
                .set(CrmOpportunity::getOwnerId, successorUserId)
                .set(CrmOpportunity::getOwnerName, successorOwnerName)
                .set(CrmOpportunity::getUpdateTime, LocalDateTime.now())
                .set(CrmOpportunity::getUpdateBy, "hr-employee-left"));
        updated += updateOwner(quoteMapper, new LambdaUpdateWrapper<CrmQuote>()
                .eq(CrmQuote::getOwnerId, fromOwnerUserId)
                .eq(CrmQuote::getDeleted, CrmConstants.DelFlag.NORMAL)
                .set(CrmQuote::getOwnerId, successorUserId)
                .set(CrmQuote::getOwnerName, successorOwnerName)
                .set(CrmQuote::getUpdateTime, LocalDateTime.now())
                .set(CrmQuote::getUpdateBy, "hr-employee-left"));
        updated += updateOwner(receivableMapper, new LambdaUpdateWrapper<CrmReceivable>()
                .eq(CrmReceivable::getOwnerId, fromOwnerUserId)
                .eq(CrmReceivable::getDeleted, CrmConstants.DelFlag.NORMAL)
                .set(CrmReceivable::getOwnerId, successorUserId)
                .set(CrmReceivable::getOwnerName, successorOwnerName)
                .set(CrmReceivable::getUpdateTime, LocalDateTime.now())
                .set(CrmReceivable::getUpdateBy, "hr-employee-left"));
        updated += updateOwner(renewalMapper, new LambdaUpdateWrapper<CrmRenewal>()
                .eq(CrmRenewal::getOwnerId, fromOwnerUserId)
                .eq(CrmRenewal::getDeleted, CrmConstants.DelFlag.NORMAL)
                .set(CrmRenewal::getOwnerId, successorUserId)
                .set(CrmRenewal::getOwnerName, successorOwnerName)
                .set(CrmRenewal::getUpdateTime, LocalDateTime.now())
                .set(CrmRenewal::getUpdateBy, "hr-employee-left"));
        updated += updateOwner(serviceTicketMapper, new LambdaUpdateWrapper<CrmServiceTicket>()
                .eq(CrmServiceTicket::getOwnerId, fromOwnerUserId)
                .eq(CrmServiceTicket::getDeleted, CrmConstants.DelFlag.NORMAL)
                .set(CrmServiceTicket::getOwnerId, successorUserId)
                .set(CrmServiceTicket::getOwnerName, successorOwnerName)
                .set(CrmServiceTicket::getUpdateTime, LocalDateTime.now())
                .set(CrmServiceTicket::getUpdateBy, "hr-employee-left"));

        CrmHandoverTask task = buildTask("AUTO_REASSIGN", 0L, "员工离职自动交接",
                fromOwnerUserId, fromOwnerName, fromDeptId, eventId);
        task.setStatus("REASSIGNED");
        task.setToOwnerId(successorUserId);
        task.setToOwnerName(successorOwnerName);
        task.setRemark("离职事件自动交接，共处理 " + updated + " 条业务记录");
        handoverTaskMapper.insert(task);
        log.info("员工离职自动交接完成: fromUserId={}, toUserId={}, updated={}",
                fromOwnerUserId, successorUserId, updated);
        return updated;
    }

    @Override
    public List<CrmHandoverTask> listPending(Long fromOwnerId) {
        LambdaQueryWrapper<CrmHandoverTask> wrapper = new LambdaQueryWrapper<CrmHandoverTask>()
                .eq(CrmHandoverTask::getDeleted, CrmConstants.DelFlag.NORMAL)
                .eq(CrmHandoverTask::getStatus, "PENDING")
                .orderByDesc(CrmHandoverTask::getCreateTime);
        if (fromOwnerId != null) {
            wrapper.eq(CrmHandoverTask::getFromOwnerId, fromOwnerId);
        }
        return handoverTaskMapper.selectList(wrapper);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public int reassign(Long handoverId, Long toOwnerUserId, String toOwnerName, String remark) {
        if (handoverId == null || toOwnerUserId == null) {
            throw new IllegalArgumentException("交接任务ID与新负责人不能为空");
        }
        CrmHandoverTask task = handoverTaskMapper.selectById(handoverId);
        if (task == null || !CrmConstants.DelFlag.NORMAL.equals(task.getDeleted())) {
            throw new IllegalArgumentException("交接任务不存在");
        }
        if (!"PENDING".equals(task.getStatus())) {
            throw new IllegalArgumentException("仅待处理状态可重新指派");
        }

        if ("CRM_CUSTOMER".equals(task.getBusinessType())) {
            LambdaUpdateWrapper<CrmCustomer> wrapper = new LambdaUpdateWrapper<CrmCustomer>()
                    .eq(CrmCustomer::getCustomerId, task.getBusinessId())
                    .set(CrmCustomer::getOwnerId, toOwnerUserId)
                    .set(CrmCustomer::getOwnerName, toOwnerName)
                    .set(CrmCustomer::getUpdateTime, LocalDateTime.now())
                    .set(CrmCustomer::getUpdateBy, "crm-handover");
            customerMapper.update(null, wrapper);
        } else if ("CRM_OPPORTUNITY".equals(task.getBusinessType())) {
            LambdaUpdateWrapper<CrmOpportunity> wrapper = new LambdaUpdateWrapper<CrmOpportunity>()
                    .eq(CrmOpportunity::getOpportunityId, task.getBusinessId())
                    .set(CrmOpportunity::getOwnerId, toOwnerUserId)
                    .set(CrmOpportunity::getOwnerName, toOwnerName)
                    .set(CrmOpportunity::getUpdateTime, LocalDateTime.now())
                    .set(CrmOpportunity::getUpdateBy, "crm-handover");
            opportunityMapper.update(null, wrapper);
        } else {
            throw new IllegalArgumentException("不支持的业务类型: " + task.getBusinessType());
        }

        task.setStatus("REASSIGNED");
        task.setToOwnerId(toOwnerUserId);
        task.setToOwnerName(toOwnerName);
        if (StringUtils.hasText(remark)) {
            task.setRemark(remark);
        }
        task.setUpdateTime(LocalDateTime.now());
        task.setUpdateBy("crm-handover");
        return handoverTaskMapper.updateById(task);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public int close(Long handoverId, String remark) {
        CrmHandoverTask task = handoverTaskMapper.selectById(handoverId);
        if (task == null || !CrmConstants.DelFlag.NORMAL.equals(task.getDeleted())) {
            throw new IllegalArgumentException("交接任务不存在");
        }
        task.setStatus("CLOSED");
        if (StringUtils.hasText(remark)) {
            task.setRemark(remark);
        }
        task.setUpdateTime(LocalDateTime.now());
        task.setUpdateBy("crm-handover");
        return handoverTaskMapper.updateById(task);
    }

    private boolean existsPending(String businessType, Long businessId, Long fromOwnerId) {
        return handoverTaskMapper.selectCount(new LambdaQueryWrapper<CrmHandoverTask>()
                .eq(CrmHandoverTask::getBusinessType, businessType)
                .eq(CrmHandoverTask::getBusinessId, businessId)
                .eq(CrmHandoverTask::getFromOwnerId, fromOwnerId)
                .eq(CrmHandoverTask::getStatus, "PENDING")
                .eq(CrmHandoverTask::getDeleted, CrmConstants.DelFlag.NORMAL)) > 0;
    }

    private <T> int updateOwner(com.baomidou.mybatisplus.core.mapper.BaseMapper<T> mapper,
                                LambdaUpdateWrapper<T> wrapper) {
        return mapper.update(null, wrapper);
    }

    private String resolveSuccessorName(Long successorUserId) {
        if (successorUserId == null) {
            return null;
        }
        try {
            HrEmployeeSummaryVO employee = remoteHrService.getEmployeeByUserId(successorUserId).getData();
            return employee == null ? null : employee.getEmployeeName();
        } catch (Exception ex) {
            log.warn("查询离职接替人失败: successorUserId={}", successorUserId, ex);
            return null;
        }
    }

    private CrmHandoverTask buildTask(String businessType, Long businessId, String businessName,
                                      Long fromOwnerId, String fromOwnerName, Long fromDeptId, String eventId) {
        CrmHandoverTask task = new CrmHandoverTask();
        task.setTenantId(DEFAULT_TENANT_ID);
        task.setFromOwnerId(fromOwnerId);
        task.setFromOwnerName(fromOwnerName);
        task.setFromDeptId(fromDeptId);
        task.setBusinessType(businessType);
        task.setBusinessId(businessId);
        task.setBusinessName(businessName);
        task.setStatus("PENDING");
        task.setTriggerSource("EMPLOYEE_LEFT");
        task.setTriggerEventId(eventId);
        task.setDeleted(CrmConstants.DelFlag.NORMAL);
        task.setCreateBy("hr-employee-left");
        task.setUpdateBy("hr-employee-left");
        return task;
    }
}
