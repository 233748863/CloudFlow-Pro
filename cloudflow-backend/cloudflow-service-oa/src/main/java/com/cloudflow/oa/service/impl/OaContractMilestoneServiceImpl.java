package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.oa.domain.OaContractMilestone;
import com.cloudflow.oa.domain.OaContractPaymentSchedule;
import com.cloudflow.oa.domain.vo.DynamicMapVO;
import com.cloudflow.oa.mapper.OaContractMilestoneMapper;
import com.cloudflow.oa.mapper.OaContractPaymentScheduleMapper;
import com.cloudflow.oa.service.IOaContractMilestoneService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * OA-P1-1 合同履约里程碑 + 付款计划实现。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class OaContractMilestoneServiceImpl implements IOaContractMilestoneService {

    private static final Long DEFAULT_TENANT_ID = 100000L;

    private final OaContractMilestoneMapper milestoneMapper;
    private final OaContractPaymentScheduleMapper paymentMapper;

    @Override
    public Page<OaContractMilestone> pageMilestones(Long contractId, String status, Integer pageNum, Integer pageSize) {
        LambdaQueryWrapper<OaContractMilestone> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(OaContractMilestone::getDeleted, 0);
        if (contractId != null) {
            wrapper.eq(OaContractMilestone::getContractId, contractId);
        }
        if (StringUtils.hasText(status)) {
            wrapper.eq(OaContractMilestone::getStatus, status);
        }
        wrapper.orderByAsc(OaContractMilestone::getMilestoneNo)
                .orderByAsc(OaContractMilestone::getId);
        return milestoneMapper.selectPage(new Page<>(pageNum, pageSize), wrapper);
    }

    @Override
    public List<OaContractMilestone> listByContract(Long contractId) {
        if (contractId == null) {
            return List.of();
        }
        return milestoneMapper.selectList(new LambdaQueryWrapper<OaContractMilestone>()
                .eq(OaContractMilestone::getContractId, contractId)
                .eq(OaContractMilestone::getDeleted, 0)
                .orderByAsc(OaContractMilestone::getMilestoneNo)
                .orderByAsc(OaContractMilestone::getId));
    }

    @Override
    @Transactional
    public boolean saveMilestone(OaContractMilestone milestone) {
        if (milestone == null || milestone.getContractId() == null
                || !StringUtils.hasText(milestone.getMilestoneName())) {
            throw new IllegalArgumentException("合同ID与里程碑名称必填");
        }
        if (milestone.getTenantId() == null) {
            milestone.setTenantId(DEFAULT_TENANT_ID);
        }
        if (!StringUtils.hasText(milestone.getStatus())) {
            milestone.setStatus("PENDING");
        }
        if (!StringUtils.hasText(milestone.getMilestoneType())) {
            milestone.setMilestoneType("DELIVERY");
        }
        if (milestone.getMilestoneNo() == null) {
            milestone.setMilestoneNo(1);
        }
        milestone.setCreateBy(UserContext.getUserName());
        milestone.setUpdateBy(UserContext.getUserName());
        return milestoneMapper.insert(milestone) > 0;
    }

    @Override
    @Transactional
    public boolean updateMilestone(OaContractMilestone milestone) {
        if (milestone == null || milestone.getId() == null) {
            throw new IllegalArgumentException("ID 必填");
        }
        milestone.setUpdateBy(UserContext.getUserName());
        milestone.setUpdateTime(LocalDateTime.now());
        return milestoneMapper.updateById(milestone) > 0;
    }

    @Override
    @Transactional
    public boolean removeMilestone(Long id) {
        if (id == null) {
            return false;
        }
        OaContractMilestone exist = milestoneMapper.selectById(id);
        if (exist == null) {
            return false;
        }
        exist.setDeleted(1);
        exist.setUpdateBy(UserContext.getUserName());
        exist.setUpdateTime(LocalDateTime.now());
        return milestoneMapper.updateById(exist) > 0;
    }

    @Override
    @Transactional
    public boolean completeMilestone(Long id, String remark) {
        OaContractMilestone exist = milestoneMapper.selectById(id);
        if (exist == null || (exist.getDeleted() != null && exist.getDeleted() == 1)) {
            return false;
        }
        exist.setActualDate(LocalDate.now());
        exist.setStatus("DONE");
        if (StringUtils.hasText(remark)) {
            exist.setCompletionRemark(remark);
        }
        exist.setUpdateBy(UserContext.getUserName());
        exist.setUpdateTime(LocalDateTime.now());
        return milestoneMapper.updateById(exist) > 0;
    }

    @Override
    public Page<OaContractPaymentSchedule> pagePayments(Long contractId, String status, Integer pageNum, Integer pageSize) {
        LambdaQueryWrapper<OaContractPaymentSchedule> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(OaContractPaymentSchedule::getDeleted, 0);
        if (contractId != null) {
            wrapper.eq(OaContractPaymentSchedule::getContractId, contractId);
        }
        if (StringUtils.hasText(status)) {
            wrapper.eq(OaContractPaymentSchedule::getStatus, status);
        }
        wrapper.orderByAsc(OaContractPaymentSchedule::getPaymentNo)
                .orderByAsc(OaContractPaymentSchedule::getId);
        return paymentMapper.selectPage(new Page<>(pageNum, pageSize), wrapper);
    }

    @Override
    public List<OaContractPaymentSchedule> listPaymentsByContract(Long contractId) {
        if (contractId == null) {
            return List.of();
        }
        return paymentMapper.selectList(new LambdaQueryWrapper<OaContractPaymentSchedule>()
                .eq(OaContractPaymentSchedule::getContractId, contractId)
                .eq(OaContractPaymentSchedule::getDeleted, 0)
                .orderByAsc(OaContractPaymentSchedule::getPaymentNo)
                .orderByAsc(OaContractPaymentSchedule::getId));
    }

    @Override
    @Transactional
    public boolean savePayment(OaContractPaymentSchedule schedule) {
        if (schedule == null || schedule.getContractId() == null
                || !StringUtils.hasText(schedule.getPaymentName())
                || schedule.getPlanDate() == null || schedule.getAmount() == null) {
            throw new IllegalArgumentException("合同ID/名称/计划日期/金额必填");
        }
        if (schedule.getTenantId() == null) {
            schedule.setTenantId(DEFAULT_TENANT_ID);
        }
        if (!StringUtils.hasText(schedule.getStatus())) {
            schedule.setStatus("PENDING");
        }
        if (!StringUtils.hasText(schedule.getCurrency())) {
            schedule.setCurrency("CNY");
        }
        if (schedule.getPaymentNo() == null) {
            schedule.setPaymentNo(1);
        }
        schedule.setCreateBy(UserContext.getUserName());
        schedule.setUpdateBy(UserContext.getUserName());
        return paymentMapper.insert(schedule) > 0;
    }

    @Override
    @Transactional
    public boolean updatePayment(OaContractPaymentSchedule schedule) {
        if (schedule == null || schedule.getId() == null) {
            throw new IllegalArgumentException("ID 必填");
        }
        schedule.setUpdateBy(UserContext.getUserName());
        schedule.setUpdateTime(LocalDateTime.now());
        return paymentMapper.updateById(schedule) > 0;
    }

    @Override
    @Transactional
    public boolean removePayment(Long id) {
        if (id == null) {
            return false;
        }
        OaContractPaymentSchedule exist = paymentMapper.selectById(id);
        if (exist == null) {
            return false;
        }
        exist.setDeleted(1);
        exist.setUpdateBy(UserContext.getUserName());
        exist.setUpdateTime(LocalDateTime.now());
        return paymentMapper.updateById(exist) > 0;
    }

    @Override
    @Transactional
    public boolean payPayment(Long id, BigDecimal actualAmount, String remark) {
        OaContractPaymentSchedule exist = paymentMapper.selectById(id);
        if (exist == null || (exist.getDeleted() != null && exist.getDeleted() == 1)) {
            return false;
        }
        exist.setActualDate(LocalDate.now());
        exist.setActualAmount(actualAmount != null ? actualAmount : exist.getAmount());
        exist.setStatus("PAID");
        if (StringUtils.hasText(remark)) {
            exist.setRemark(remark);
        }
        exist.setUpdateBy(UserContext.getUserName());
        exist.setUpdateTime(LocalDateTime.now());
        return paymentMapper.updateById(exist) > 0;
    }

    @Override
    public List<DynamicMapVO> loadOverdueRiskItems(int limit) {
        if (limit <= 0) {
            limit = 8;
        }
        List<Map<String, Object>> risks = new ArrayList<>();
        LocalDate today = LocalDate.now();

        // 1) 里程碑逾期: planned_date < today 且 status ∈ PENDING/IN_PROGRESS
        List<OaContractMilestone> overdueMilestones = milestoneMapper.selectList(
                new LambdaQueryWrapper<OaContractMilestone>()
                        .eq(OaContractMilestone::getDeleted, 0)
                        .in(OaContractMilestone::getStatus, "PENDING", "IN_PROGRESS")
                        .lt(OaContractMilestone::getPlannedDate, today)
                        .orderByAsc(OaContractMilestone::getPlannedDate)
                        .last("LIMIT " + limit));
        for (OaContractMilestone m : overdueMilestones) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", "milestone:" + m.getId());
            item.put("title", "合同履约逾期: " + m.getMilestoneName());
            item.put("description", "计划完成 " + m.getPlannedDate() + "，当前状态 " + m.getStatus());
            item.put("level", "HIGH");
            item.put("businessType", "CONTRACT_MILESTONE");
            item.put("businessId", m.getContractId());
            item.put("ownerName", m.getOwnerName());
            risks.add(item);
        }

        // 2) 付款节点逾期: plan_date < today 且 status ∈ PENDING
        List<OaContractPaymentSchedule> overduePayments = paymentMapper.selectList(
                new LambdaQueryWrapper<OaContractPaymentSchedule>()
                        .eq(OaContractPaymentSchedule::getDeleted, 0)
                        .eq(OaContractPaymentSchedule::getStatus, "PENDING")
                        .lt(OaContractPaymentSchedule::getPlanDate, today)
                        .orderByAsc(OaContractPaymentSchedule::getPlanDate)
                        .last("LIMIT " + limit));
        for (OaContractPaymentSchedule p : overduePayments) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", "payment:" + p.getId());
            item.put("title", "付款节点逾期: " + p.getPaymentName());
            item.put("description", "计划付款日 " + p.getPlanDate() + "，金额 " + p.getAmount());
            item.put("level", "HIGH");
            item.put("businessType", "CONTRACT_PAYMENT");
            item.put("businessId", p.getContractId());
            item.put("ownerName", p.getPayeeName());
            risks.add(item);
        }
        return risks.stream().limit(limit).map(DynamicMapVO::from).toList();
    }
}
