package com.cloudflow.crm.service.impl;

import com.cloudflow.common.holiday.domain.HolidayCalendar;
import com.cloudflow.crm.exception.CrmBusinessException;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.holiday.mapper.HolidayCalendarMapper;
import com.cloudflow.common.redis.lock.DistributedLock;
import com.cloudflow.crm.domain.*;
import com.cloudflow.crm.domain.dto.CrmSlaPolicyRequest;
import com.cloudflow.crm.mapper.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDate;
import java.util.*;

@Service
@RequiredArgsConstructor
public class CrmSlaPolicyService {
    public static final Set<String> TICKET_STATUSES = Set.of("OPEN", "IN_PROGRESS", "WAITING_CUSTOMER", "RESOLVED", "CLOSED");
    private final CrmSlaPolicyMapper policyMapper;
    private final CrmSlaPriorityMapper priorityMapper;
    private final CrmSlaStatusRuleMapper ruleMapper;
    private final CrmServiceTicketMapper ticketMapper;
    private final CrmCustomerMapper customerMapper;
    private final HolidayCalendarMapper calendarMapper;
    private final CrmSlaPriorityCatalog catalog;
    private final CrmReferenceService references;

    public PageResult<CrmSlaPolicy> page(PageQuery page) {
        return PageResult.build(policyMapper.selectPage(page.build(), new LambdaQueryWrapper<CrmSlaPolicy>()
                .orderByAsc(CrmSlaPolicy::getPriority, CrmSlaPolicy::getPolicyId)));
    }

    public CrmSlaPolicyRequest detail(Long id) {
        CrmSlaPolicyRequest result = new CrmSlaPolicyRequest();
        result.setPolicy(CrmRecordSupport.require(policyMapper.selectById(id), "SLA策略不存在"));
        result.setPriorities(priorityMapper.selectList(new LambdaQueryWrapper<CrmSlaPriority>()
                .eq(CrmSlaPriority::getPolicyId, id).orderByAsc(CrmSlaPriority::getSortNo)));
        result.setRules(rules(id));
        return result;
    }

    @Audit(name = "保存SLA策略", spel = "#request", diff = true)
    @Transactional(rollbackFor = Exception.class)
    @DistributedLock(key = "'crm:sla:policy:' + T(com.cloudflow.crm.service.impl.CrmRecordSupport).tenantId()")
    public Long save(CrmSlaPolicyRequest request) {
        CrmSlaPolicy policy = request.getPolicy();
        policy.setPolicyCode(CrmRecordSupport.text(policy.getPolicyCode(), 50, "策略编码"));
        policy.setPolicyName(CrmRecordSupport.text(policy.getPolicyName(), 120, "策略名称"));
        policy.setEntityType(CrmRecordSupport.code(policy.getEntityType(), "GLOBAL", Set.of("GLOBAL", "CUSTOMER", "CUSTOMER_LEVEL", "INDUSTRY"), "适用范围"));
        policy.setStatus(CrmRecordSupport.code(policy.getStatus(), "ENABLED", Set.of("ENABLED", "DISABLED"), "策略状态"));
        policy.setDefaultFlag(CrmRecordSupport.flag(policy.getDefaultFlag()));
        policy.setRoundTheClockFlag(CrmRecordSupport.flag(policy.getRoundTheClockFlag()));
        policy.setApplyForResolution(policy.getApplyForResolution() == null ? 1 : CrmRecordSupport.flag(policy.getApplyForResolution()));
        if (policy.getPriority() == null) policy.setPriority(100);
        if (policy.getEffectiveStart() != null && policy.getEffectiveEnd() != null && policy.getEffectiveEnd().isBefore(policy.getEffectiveStart())) {
            throw new CrmBusinessException("策略生效结束日期不能早于开始日期");
        }
        if ("GLOBAL".equals(policy.getEntityType())) policy.setEntityId(null);
        else {
            policy.setEntityId(CrmRecordSupport.text(policy.getEntityId(), 64, "适用对象"));
            if ("CUSTOMER".equals(policy.getEntityType())) references.customer(Long.valueOf(policy.getEntityId()));
            if (policy.getDefaultFlag() == 1) throw new CrmBusinessException("只有全局策略可设为默认");
        }
        if (policy.getRoundTheClockFlag() == 0) {
            HolidayCalendar calendar = CrmRecordSupport.require(calendarMapper.selectById(CrmRecordSupport.require(policy.getHolidayCalendarId(), "工作时间策略必须绑定日历")), "日历不存在");
            if (!"ENABLED".equals(calendar.getStatus())) throw new CrmBusinessException("日历未启用");
        }
        if (policy.getPolicyId() == null) {
            CrmRecordSupport.create(policy, "policyId");
            policyMapper.insert(policy);
        } else {
            CrmSlaPolicy original = CrmRecordSupport.require(policyMapper.selectById(policy.getPolicyId()), "SLA策略不存在");
            if (ticketMapper.selectCount(new LambdaQueryWrapper<CrmServiceTicket>().eq(CrmServiceTicket::getSlaPolicyId, policy.getPolicyId())) > 0) {
                throw new CrmBusinessException("此策略已有工单引用；可停用原策略，复制为新策略后修改计时规则");
            }
            CrmRecordSupport.update(policy, original);
            CrmRecordSupport.saved(policyMapper.updateById(policy));
        }
        if (policy.getDefaultFlag() == 1) {
            policyMapper.update(null, new LambdaUpdateWrapper<CrmSlaPolicy>().ne(CrmSlaPolicy::getPolicyId, policy.getPolicyId())
                    .eq(CrmSlaPolicy::getDefaultFlag, 1).set(CrmSlaPolicy::getDefaultFlag, 0));
        }
        List<CrmSlaPriority> priorities = request.getPriorities().isEmpty() ? catalog.defaults() : request.getPriorities();
        Set<String> codes = new HashSet<>();
        priorityMapper.deactivateChildren(policy.getPolicyId());
        for (CrmSlaPriority priority : priorities) {
            priority.setPriorityCode(CrmRecordSupport.code(priority.getPriorityCode(), null, CrmSlaPriorityCatalog.CODES, "SLA优先级"));
            if (!codes.add(priority.getPriorityCode())) throw new CrmBusinessException("SLA优先级重复");
            priority.setPriorityName(CrmRecordSupport.text(priority.getPriorityName(), 64, "优先级名称"));
            positive(priority.getFirstResponseMinutes());
            if (policy.getApplyForResolution() == 1) positive(priority.getResolutionMinutes());
            if (priority.getSortNo() == null) priority.setSortNo(Integer.parseInt(priority.getPriorityCode().substring(1)));
            CrmRecordSupport.create(priority, "priorityId"); priority.setPolicyId(policy.getPolicyId());
            priorityMapper.upsert(priority);
        }
        Set<String> statuses = new HashSet<>();
        boolean hasFulfill = false;
        ruleMapper.deactivateChildren(policy.getPolicyId());
        for (CrmSlaStatusRule rule : request.getRules()) {
            rule.setRuleType(CrmRecordSupport.code(rule.getRuleType(), null, Set.of("PAUSE", "FULFILL"), "规则类型"));
            rule.setTicketStatus(CrmRecordSupport.code(rule.getTicketStatus(), null, TICKET_STATUSES, "工单状态"));
            if (!statuses.add(rule.getTicketStatus())) throw new CrmBusinessException("同一工单状态只能配置一个暂停或履约规则");
            if ("FULFILL".equals(rule.getRuleType())) hasFulfill = true;
            CrmRecordSupport.create(rule, "ruleId"); rule.setPolicyId(policy.getPolicyId());
            ruleMapper.upsert(rule);
        }
        if (!hasFulfill) throw new CrmBusinessException("至少需要配置一个履约状态");
        return policy.getPolicyId();
    }

    private void positive(Integer minutes) {
        if (minutes == null || minutes <= 0) throw new CrmBusinessException("SLA时限必须是正整数分钟");
    }

    @Audit(name = "停用SLA策略", highRisk = true)
    public void disable(Long id) {
        detail(id);
        policyMapper.update(null, new LambdaUpdateWrapper<CrmSlaPolicy>().eq(CrmSlaPolicy::getPolicyId, id).set(CrmSlaPolicy::getStatus, "DISABLED"));
    }

    public CrmSlaPolicy match(CrmServiceTicket ticket) {
        CrmCustomer customer = customerMapper.selectById(ticket.getCustomerId());
        LocalDate date = ticket.getOpenedTime().toLocalDate();
        return policyMapper.selectList(new LambdaQueryWrapper<CrmSlaPolicy>().eq(CrmSlaPolicy::getStatus, "ENABLED")).stream()
                .filter(policy -> policy.getEffectiveStart() == null || !date.isBefore(policy.getEffectiveStart()))
                .filter(policy -> policy.getEffectiveEnd() == null || !date.isAfter(policy.getEffectiveEnd()))
                .filter(policy -> rank(policy, customer) < 4)
                .min(Comparator.comparingInt((CrmSlaPolicy policy) -> rank(policy, customer))
                        .thenComparing(CrmSlaPolicy::getPriority).thenComparing(CrmSlaPolicy::getPolicyId)).orElse(null);
    }

    public static int rank(CrmSlaPolicy policy, CrmCustomer customer) {
        if ("CUSTOMER".equals(policy.getEntityType()) && customer != null && Objects.equals(policy.getEntityId(), String.valueOf(customer.getCustomerId()))) return 0;
        if ("CUSTOMER_LEVEL".equals(policy.getEntityType()) && customer != null && Objects.equals(policy.getEntityId(), customer.getLevelCode())) return 1;
        if ("INDUSTRY".equals(policy.getEntityType()) && customer != null && Objects.equals(policy.getEntityId(), customer.getIndustry())) return 2;
        if ("GLOBAL".equals(policy.getEntityType()) && Integer.valueOf(1).equals(policy.getDefaultFlag())) return 3;
        return 4;
    }

    public CrmSlaPriority priority(Long policyId, String code) {
        CrmSlaPriority configured = priorityMapper.selectOne(new LambdaQueryWrapper<CrmSlaPriority>()
                .eq(CrmSlaPriority::getPolicyId, policyId).eq(CrmSlaPriority::getPriorityCode, code));
        return configured == null ? catalog.fallback(code) : configured;
    }

    public List<CrmSlaStatusRule> rules(Long policyId) {
        return ruleMapper.selectList(new LambdaQueryWrapper<CrmSlaStatusRule>().eq(CrmSlaStatusRule::getPolicyId, policyId));
    }
}
