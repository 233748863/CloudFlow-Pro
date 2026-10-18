package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.message.api.MessageReceiver;
import com.cloudflow.common.message.api.MessageSender;
import com.cloudflow.common.message.api.MessageSendRequest;
import com.cloudflow.common.message.constant.MessageCategory;
import com.cloudflow.common.message.constant.MessageChannelType;
import com.cloudflow.common.redis.config.RuntimeSysConfigService;
import com.cloudflow.crm.domain.CrmServiceTicket;
import com.cloudflow.crm.domain.CrmSlaPolicy;
import com.cloudflow.crm.domain.CrmSlaPriority;
import com.cloudflow.crm.domain.CrmSlaStatusRule;
import com.cloudflow.crm.mapper.CrmServiceTicketMapper;
import com.cloudflow.crm.mapper.CrmSlaPolicyMapper;
import com.cloudflow.crm.mapper.CrmStaffMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class CrmSlaService {
    private final CrmSlaClock clock;
    private final CrmSlaPolicyService policies;
    private final CrmSlaPolicyMapper policyMapper;
    private final CrmServiceTicketMapper ticketMapper;
    private final CrmStaffMapper staffMapper;
    private final MessageSender messageSender;
    private final CrmAuditTrail auditTrail;
    private final RuntimeSysConfigService config;
    private final TransactionTemplate transactionTemplate;

    public void initialize(CrmServiceTicket ticket) {
        ticket.setSlaPolicyId(null); ticket.setFirstResponseDue(null); ticket.setResolutionDue(null); ticket.setDueTime(null);
        ticket.setFirstResponseTime(null); ticket.setFirstResponseMinutes(null); ticket.setResolutionMinutes(null);
        ticket.setSlaPausedMinutes(0); ticket.setPauseStartTime(null);
        ticket.setResponseBreachedFlag(0); ticket.setResolutionBreachedFlag(0); ticket.setSlaStatus("NOT_APPLICABLE");
        ticket.setOpenedTime(ticket.getOpenedTime().truncatedTo(ChronoUnit.MINUTES));
        CrmSlaPolicy policy = policies.match(ticket);
        if (policy == null) return;
        ticket.setSlaPolicyId(policy.getPolicyId());
        recalculateDeadlines(ticket, policy);
        ticket.setSlaStatus("ONGOING");
    }

    public void change(CrmServiceTicket ticket, String oldStatus, String oldSeverity, boolean response) {
        if (ticket.getSlaPolicyId() == null) return;
        CrmSlaPolicy policy = CrmRecordSupport.require(policyMapper.selectById(ticket.getSlaPolicyId()), "工单引用的SLA策略不存在");
        LocalDateTime now = LocalDateTime.now().truncatedTo(ChronoUnit.MINUTES);
        List<CrmSlaStatusRule> rules = policies.rules(policy.getPolicyId());
        boolean pause = matches(rules, "PAUSE", ticket.getStatus());
        boolean fulfill = matches(rules, "FULFILL", ticket.getStatus());
        boolean finished = ticket.getResolutionMinutes() != null || "FULFILLED".equals(ticket.getSlaStatus());
        if (finished) return;
        if (ticket.getPauseStartTime() != null && !pause) {
            long paused = elapsed(ticket, policy, ticket.getPauseStartTime(), now);
            ticket.setSlaPausedMinutes(Math.toIntExact((long) ticket.getSlaPausedMinutes() + paused));
            if (ticket.getFirstResponseTime() == null) ticket.setFirstResponseDue(add(ticket, policy, ticket.getFirstResponseDue(), paused));
            ticket.setResolutionDue(add(ticket, policy, ticket.getResolutionDue(), paused));
            ticket.setPauseStartTime(null);
        }
        if (!Objects.equals(oldSeverity, ticket.getSeverity())) recalculateDeadlines(ticket, policy);
        if (response && ticket.getFirstResponseTime() == null) {
            if (ticket.getPauseStartTime() != null) {
                ticket.setFirstResponseDue(add(ticket, policy, ticket.getFirstResponseDue(), elapsed(ticket, policy, ticket.getPauseStartTime(), now)));
            }
            ticket.setFirstResponseTime(now);
            ticket.setFirstResponseMinutes(Math.toIntExact(consumed(ticket, policy, now)));
        }
        if (pause && ticket.getPauseStartTime() == null) ticket.setPauseStartTime(now);
        if (fulfill) {
            if (ticket.getFirstResponseTime() == null) {
                ticket.setFirstResponseTime(now); ticket.setFirstResponseMinutes(Math.toIntExact(consumed(ticket, policy, now)));
            }
            ticket.setResolvedTime(now);
            ticket.setResolutionMinutes(Math.toIntExact(consumed(ticket, policy, now)));
        }
        judge(ticket, policy, now, fulfill);
        ticket.setDueTime(ticket.getResolutionDue() == null ? ticket.getFirstResponseDue() : ticket.getResolutionDue());
        notifyBreaches(ticket);
    }

    private boolean matches(List<CrmSlaStatusRule> rules, String type, String status) {
        return rules.stream().anyMatch(rule -> type.equals(rule.getRuleType()) && status.equals(rule.getTicketStatus()));
    }

    private void recalculateDeadlines(CrmServiceTicket ticket, CrmSlaPolicy policy) {
        CrmSlaPriority priority = policies.priority(policy.getPolicyId(), ticket.getSeverity());
        long paused = ticket.getSlaPausedMinutes() == null ? 0 : ticket.getSlaPausedMinutes();
        if (ticket.getFirstResponseTime() == null) {
            ticket.setFirstResponseDue(add(ticket, policy, ticket.getOpenedTime(), priority.getFirstResponseMinutes() + paused));
        }
        if (Integer.valueOf(1).equals(policy.getApplyForResolution())) {
            CrmSlaPriority effective = priority.getResolutionMinutes() == null ? policies.priority(-1L, ticket.getSeverity()) : priority;
            ticket.setResolutionDue(add(ticket, policy, ticket.getOpenedTime(), effective.getResolutionMinutes() + paused));
        } else ticket.setResolutionDue(null);
        ticket.setDueTime(ticket.getResolutionDue() == null ? ticket.getFirstResponseDue() : ticket.getResolutionDue());
    }

    private long consumed(CrmServiceTicket ticket, CrmSlaPolicy policy, LocalDateTime time) {
        LocalDateTime until = ticket.getPauseStartTime() == null ? time : ticket.getPauseStartTime();
        return Math.max(0, elapsed(ticket, policy, ticket.getOpenedTime(), until) - ticket.getSlaPausedMinutes());
    }

    private void judge(CrmServiceTicket ticket, CrmSlaPolicy policy, LocalDateTime now, boolean fulfilled) {
        LocalDateTime activeUntil = ticket.getPauseStartTime() == null ? now : ticket.getPauseStartTime();
        LocalDateTime responseUntil = ticket.getFirstResponseTime() == null ? activeUntil : ticket.getFirstResponseTime();
        if (overdue(ticket, policy, ticket.getFirstResponseDue(), responseUntil)) ticket.setResponseBreachedFlag(1);
        LocalDateTime resolutionUntil = ticket.getResolvedTime() != null && ticket.getResolutionMinutes() != null ? ticket.getResolvedTime() : activeUntil;
        if (overdue(ticket, policy, ticket.getResolutionDue(), resolutionUntil)) ticket.setResolutionBreachedFlag(1);
        if (ticket.getPauseStartTime() != null) ticket.setSlaStatus("PAUSED");
        else if (Integer.valueOf(1).equals(ticket.getResolutionBreachedFlag())) ticket.setSlaStatus("RESOLUTION_BREACHED");
        else if (Integer.valueOf(1).equals(ticket.getResponseBreachedFlag())) ticket.setSlaStatus("RESPONSE_BREACHED");
        else ticket.setSlaStatus(fulfilled ? "FULFILLED" : "ONGOING");
    }

    private boolean overdue(CrmServiceTicket ticket, CrmSlaPolicy policy, LocalDateTime due, LocalDateTime point) {
        return due != null && point != null && point.isAfter(due) && elapsed(ticket, policy, due, point) > 0;
    }

    private LocalDateTime add(CrmServiceTicket ticket, CrmSlaPolicy policy, LocalDateTime from, long minutes) {
        if (from == null) return null;
        try {
            return clock.add(policy.getHolidayCalendarId(), Integer.valueOf(1).equals(policy.getRoundTheClockFlag()), from, minutes);
        } catch (RuntimeException failure) {
            calendarFailure(ticket, failure);
            return from.truncatedTo(ChronoUnit.MINUTES).plusMinutes(minutes);
        }
    }

    private long elapsed(CrmServiceTicket ticket, CrmSlaPolicy policy, LocalDateTime from, LocalDateTime to) {
        try {
            return clock.elapsed(policy.getHolidayCalendarId(), Integer.valueOf(1).equals(policy.getRoundTheClockFlag()), from, to);
        } catch (RuntimeException failure) {
            calendarFailure(ticket, failure);
            return Math.max(0, ChronoUnit.MINUTES.between(from.truncatedTo(ChronoUnit.MINUTES), to.truncatedTo(ChronoUnit.MINUTES)));
        }
    }

    private void calendarFailure(CrmServiceTicket ticket, RuntimeException failure) {
        String reference = ticket.getTicketId() == null ? ticket.getTicketNo() : String.valueOf(ticket.getTicketId());
        log.error("SLA日历不可用，工单{}按自然分钟兜底，需要复核截止时间", reference, failure);
        try {
            auditTrail.recordAttempt("SLA_CALENDAR_FALLBACK", reference, "日历不可用，已按自然分钟兜底", false);
            notice(ticket, "CALENDAR_FALLBACK", "SLA日历异常", "工单日历暂不可用，已按自然分钟兜底，请复核截止时间。", true);
        } catch (RuntimeException noticeFailure) {
            log.error("SLA日历降级告警写入失败，工单{}仍允许保存", reference, noticeFailure);
        }
    }

    public int dispatchDue() {
        return scan(false);
    }

    public int scanBreaches() {
        return scan(true);
    }

    private int scan(boolean breachesOnly) {
        List<Long> ids = ticketMapper.selectList(new LambdaQueryWrapper<CrmServiceTicket>()
                .select(CrmServiceTicket::getTicketId).isNotNull(CrmServiceTicket::getSlaPolicyId)
                .ne(CrmServiceTicket::getSlaStatus, "NOT_APPLICABLE")).stream().map(CrmServiceTicket::getTicketId).toList();
        int count = 0;
        List<RuntimeException> failures = new ArrayList<>();
        for (Long id : ids) {
            try {
                Integer sent = transactionTemplate.execute(status -> scanOne(id, breachesOnly));
                count += sent == null ? 0 : sent;
            } catch (RuntimeException exception) {
                log.error("工单时限扫描失败, ticketId={}", id, exception);
                failures.add(new IllegalStateException("工单时限扫描失败，工单：" + id, exception));
            }
        }
        if (!failures.isEmpty()) {
            IllegalStateException failure = new IllegalStateException("工单时限扫描存在失败工单：" + failures.size() + "条");
            failures.forEach(failure::addSuppressed);
            throw failure;
        }
        return count;
    }

    private int scanOne(Long id, boolean breachesOnly) {
        CrmServiceTicket ticket = ticketMapper.lockById(id);
        if (ticket == null || ticket.getSlaPolicyId() == null) return 0;
        CrmSlaPolicy policy = policyMapper.selectById(ticket.getSlaPolicyId());
        if (policy == null) throw new IllegalStateException("工单SLA策略丢失：" + id);
        String previous = ticket.getSlaStatus() + ":" + ticket.getResponseBreachedFlag() + ":" + ticket.getResolutionBreachedFlag();
        LocalDateTime now = LocalDateTime.now().truncatedTo(ChronoUnit.MINUTES);
        boolean fulfilled = ticket.getResolutionMinutes() != null || "FULFILLED".equals(ticket.getSlaStatus());
        if (breachesOnly) {
            judge(ticket, policy, now, fulfilled);
            boolean changed = !previous.equals(ticket.getSlaStatus() + ":" + ticket.getResponseBreachedFlag() + ":" + ticket.getResolutionBreachedFlag());
            if (changed) { CrmRecordSupport.touch(ticket); CrmRecordSupport.saved(ticketMapper.updateById(ticket)); }
            notifyBreaches(ticket);
            return changed ? 1 : 0;
        }
        if (ticket.getPauseStartTime() != null || fulfilled) return 0;
        int percent = config.getInt("crm.sla.reminder.percent", 80);
        if (percent < 1 || percent > 99) percent = 80;
        int count = 0;
        long spent = consumed(ticket, policy, now);
        if (ticket.getFirstResponseTime() == null) count += remind(ticket, policy, "RESPONSE", ticket.getFirstResponseDue(), spent, percent, now);
        count += remind(ticket, policy, "RESOLUTION", ticket.getResolutionDue(), spent, percent, now);
        return count;
    }

    private int remind(CrmServiceTicket ticket, CrmSlaPolicy policy, String type, LocalDateTime due, long spent, int percent, LocalDateTime now) {
        if (due == null) return 0;
        long budget = Math.max(1, elapsed(ticket, policy, ticket.getOpenedTime(), due) - ticket.getSlaPausedMinutes());
        String label = "RESPONSE".equals(type) ? "首次响应" : "解决";
        if (!now.isBefore(due)) {
            return notice(ticket, type + "_DUE", "工单SLA到期", label + "时限已到，到期时间：" + due, false) ? 1 : 0;
        }
        if (spent * 100 >= budget * percent) {
            return notice(ticket, type + "_APPROACHING", "工单SLA即将到期", label + "已消耗" + percent + "%工作时限，到期时间：" + due, false) ? 1 : 0;
        }
        return 0;
    }

    private void notifyBreaches(CrmServiceTicket ticket) {
        if (Integer.valueOf(1).equals(ticket.getResponseBreachedFlag())) notice(ticket, "RESPONSE_BREACHED", "工单首次响应违约", "首次响应超过承诺工作分钟，请尽快处理。", true);
        if (Integer.valueOf(1).equals(ticket.getResolutionBreachedFlag())) notice(ticket, "RESOLUTION_BREACHED", "工单解决违约", "解决用时超过承诺工作分钟，请尽快处理。", true);
    }

    private boolean notice(CrmServiceTicket ticket, String type, String title, String content, boolean includeLeader) {
        if (ticket.getOwnerId() == null) return false;
        Set<Long> receivers = new LinkedHashSet<>(); receivers.add(ticket.getOwnerId());
        if (includeLeader) {
            Long leader = leader(ticket.getOwnerId());
            if (leader != null) receivers.add(leader);
        }
        String reference = ticket.getTicketId() == null ? ticket.getTicketNo() : String.valueOf(ticket.getTicketId());
        String fullTitle = title + "：" + ticket.getTicketTitle();
        messageSender.send(MessageSendRequest.builder().templateCode("CRM_SLA_NOTICE")
                .channelTypes(List.of(MessageChannelType.INTERNAL)).receivers(receivers.stream().map(MessageReceiver::ofUser).toList())
                .category(MessageCategory.BIZ_REMINDER).bizType("CRM_TICKET_SLA").bizId(reference + ":" + type)
                .deduplicationKey("sla:" + reference + ":" + type).title(fullTitle).content(content)
                .params(Map.of("title", fullTitle, "content", content))
                .linkUrl("/office/crm?tab=ticket&ticketId=" + reference).build());
        return true;
    }

    private Long leader(Long userId) {
        Long deptId = staffMapper.selectUserDept(userId);
        Set<Long> visited = new HashSet<>();
        while (deptId != null && deptId > 0 && visited.add(deptId)) {
            CrmStaffMapper.Department department = staffMapper.selectDepartment(deptId);
            if (department == null) return null;
            if (department.getLeader() != null && !department.getLeader().isBlank()) {
                List<Long> matches = staffMapper.selectLeaderUsers(department.getLeader());
                if (matches.size() == 1 && !userId.equals(matches.get(0))) return matches.get(0);
            }
            deptId = department.getParentId();
        }
        log.warn("工单负责人{}未配置可唯一识别的上级，SLA告警仅发负责人", userId);
        return null;
    }
}
