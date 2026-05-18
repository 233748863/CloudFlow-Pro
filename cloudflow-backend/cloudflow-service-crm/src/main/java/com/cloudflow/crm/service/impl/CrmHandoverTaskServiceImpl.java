package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.crm.constant.CrmConstants;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.CrmHandoverTask;
import com.cloudflow.crm.domain.CrmOpportunity;
import com.cloudflow.crm.mapper.CrmCustomerMapper;
import com.cloudflow.crm.mapper.CrmHandoverTaskMapper;
import com.cloudflow.crm.mapper.CrmOpportunityMapper;
import com.cloudflow.crm.service.CrmHandoverTaskService;
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
public class CrmHandoverTaskServiceImpl implements CrmHandoverTaskService {

    private static final long DEFAULT_TENANT_ID = 100000L;

    private final CrmHandoverTaskMapper handoverTaskMapper;
    private final CrmCustomerMapper customerMapper;
    private final CrmOpportunityMapper opportunityMapper;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public int generateForEmployeeLeft(Long fromOwnerUserId, String fromOwnerName, Long fromDeptId, String eventId) {
        if (fromOwnerUserId == null) {
            return 0;
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
