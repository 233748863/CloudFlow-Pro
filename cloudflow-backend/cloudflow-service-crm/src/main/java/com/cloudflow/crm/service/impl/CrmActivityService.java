package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.crm.domain.vo.HrEmployeeSummaryVO;
import com.cloudflow.crm.exception.CrmBusinessException;

import cn.dev33.satoken.stp.StpUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.datascope.DataScope;
import com.cloudflow.common.datascope.DataScopeHandle;
import com.cloudflow.common.datascope.DataScopeUtils;
import com.cloudflow.crm.domain.*;
import com.cloudflow.crm.domain.dto.CrmActivityQuery;
import com.cloudflow.crm.domain.dto.CrmActivityRequest;
import com.cloudflow.crm.domain.vo.CrmActivityDetailVO;
import com.cloudflow.crm.domain.vo.CrmTimelineItemVO;
import com.cloudflow.crm.mapper.*;
import com.cloudflow.crm.service.ICrmFollowUpService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.time.temporal.TemporalAdjusters;
import java.util.*;

@Service
@RequiredArgsConstructor
public class CrmActivityService {
    public static final Set<String> STATUSES = Set.of("PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "NOT_HELD");
    public static final Set<String> ACCEPTANCE_STATUSES = Set.of("NONE", "ACCEPTED", "DECLINED", "TENTATIVE");
    private static final Set<String> TERMINAL_STATUSES = Set.of("COMPLETED", "CANCELLED", "NOT_HELD");
    private final CrmActivityMapper activityMapper;
    private final CrmActivityParticipantMapper participantMapper;
    private final CrmActivityReminderMapper reminderMapper;
    private final CrmCustomerMapper customerMapper;
    private final CrmLeadMapper leadMapper;
    private final CrmTimelineMapper timelineMapper;
    private final CrmReferenceService references;
    private final DataScopeHandle dataScopeHandle;
    private final ICrmFollowUpService followUpService;
    private final com.cloudflow.crm.mapper.CrmOpportunityMapper opportunityMapper;

    public PageResult<CrmActivity> page(CrmActivityQuery query, PageQuery page) {
        LocalDateTime now = LocalDateTime.now();
        if (query.getView() != null) {
            query.setOwnerId(UserContext.getUserId());
            LocalDate today = now.toLocalDate();
            switch (query.getView()) {
                case "TODAY" -> { query.setStart(today.atStartOfDay()); query.setEnd(today.plusDays(1).atStartOfDay()); }
                case "WEEK" -> {
                    LocalDate monday = today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
                    query.setStart(monday.atStartOfDay()); query.setEnd(monday.plusWeeks(1).atStartOfDay());
                }
                case "OVERDUE" -> query.setOverdueFlag(1);
                default -> throw new CrmBusinessException("活动视图无效");
            }
        }
        if (query.getStart() != null && query.getEnd() != null && !query.getEnd().isAfter(query.getStart())) {
            throw new CrmBusinessException("结束时间必须晚于开始时间");
        }
        Page<CrmActivity> result = activityMapper.selectPageByDataScope(page.build(), query, UserContext.getUserId(),
                activityReadScope(), now);
        for (CrmActivity activity : result.getRecords()) refreshOverdueFlag(activity, now);
        return PageResult.build(result);
    }

    public CrmActivity accessible(Long id) {
        CrmActivity activity = CrmRecordSupport.require(activityMapper.selectAccessible(id, UserContext.getUserId(),
                activityReadScope()), "活动不存在或无权访问");
        refreshOverdueFlag(activity, LocalDateTime.now());
        return activity;
    }

    private void refreshOverdueFlag(CrmActivity activity, LocalDateTime now) {
        activity.setOverdueFlag("TASK".equals(activity.getActivityType()) && !TERMINAL_STATUSES.contains(activity.getStatus())
                && activity.getEndTime().isBefore(now) ? 1 : 0);
    }

    private DataScope activityReadScope() {
        DataScope scope = DataScopeUtils.listScope("dept_id", "scope_owner_id");
        if (Boolean.TRUE.equals(dataScopeHandle.calcScope(scope))) {
            scope.setSkip(true);
        } else if (UserContext.getUserId() != null) {
            scope.setUserId(UserContext.getUserId());
        }
        return scope;
    }

    public PageResult<CrmReferenceService.ContractChoice> contractChoices(Long customerId, PageQuery page) {
        return references.contractChoices(customerId, page);
    }

    public CrmActivityDetailVO detail(Long id) {
        CrmActivityDetailVO result = new CrmActivityDetailVO();
        result.setActivity(accessible(id));
        result.setParticipants(participants(id));
        result.setReminders(reminders(id));
        result.setConflicts(conflicts(result.getActivity(), result.getParticipants()));
        return result;
    }

    @Audit(name = "保存CRM活动", spel = "#request.activity", diff = true)
    @Transactional(rollbackFor = Exception.class)
    public CrmActivityDetailVO save(CrmActivityRequest request) {
        CrmActivity activity = CrmRecordSupport.require(request.getActivity(), "活动不能为空");
        CrmActivity original = null;
        List<CrmActivityReminder> previousReminders = List.of();
        if (activity.getActivityId() == null) {
            CrmRecordSupport.create(activity, "activityId");
            activity.setActivityNo(Localize.nextNo("HD"));
            activity.setFollowUpId(null);
            activity.setCompleteTime(null);
        } else {
            writable(activity.getActivityId());
            original = CrmRecordSupport.require(activityMapper.lockById(activity.getActivityId()), "活动不存在");
            assertWritable(original);
            CrmRecordSupport.update(activity, original);
            activity.setActivityNo(original.getActivityNo());
            activity.setFollowUpId(original.getFollowUpId());
            activity.setCompleteTime(original.getCompleteTime());
            previousReminders = reminders(activity.getActivityId());
            if (TERMINAL_STATUSES.contains(original.getStatus()) && !Objects.equals(original.getStatus(), activity.getStatus())) {
                throw new CrmBusinessException("已结束的活动不能重新打开，请创建后续活动");
            }
        }
        normalize(activity, original);
        boolean rescheduled = original != null && !Objects.equals(original.getStartTime(), activity.getStartTime());
        if ("COMPLETED".equals(activity.getStatus()) && activity.getCompleteTime() == null) activity.setCompleteTime(LocalDateTime.now());
        if (original == null) activityMapper.insert(activity);
        else CrmRecordSupport.saved(activityMapper.updateById(activity));
        if (request.getParticipants() != null) saveParticipants(activity, request.getParticipants());
        List<CrmActivityReminder> requestedReminders = request.getReminders();
        if (rescheduled && requestedReminders == null) requestedReminders = previousReminders;
        if (TERMINAL_STATUSES.contains(activity.getStatus())) {
            reminderMapper.delete(new LambdaQueryWrapper<CrmActivityReminder>()
                    .eq(CrmActivityReminder::getActivityId, activity.getActivityId())
                    .eq(CrmActivityReminder::getSentFlag, 0));
        } else if (rescheduled || requestedReminders != null) {
            if (rescheduled) {
                reminderMapper.delete(new LambdaQueryWrapper<CrmActivityReminder>()
                        .eq(CrmActivityReminder::getActivityId, activity.getActivityId()));
            }
            saveReminders(activity, requestedReminders, rescheduled ? List.of() : previousReminders);
        }
        if ("COMPLETED".equals(activity.getStatus())) completeLinks(activity, request.isGenerateFollowUp());
        return detail(activity.getActivityId());
    }

    private void normalize(CrmActivity activity, CrmActivity original) {
        activity.setSubject(CrmRecordSupport.text(activity.getSubject(), 200, "活动主题"));
        activity.setActivityType(CrmRecordSupport.code(activity.getActivityType(), null, Set.of("MEETING", "CALL", "TASK"), "活动类型"));
        activity.setStatus(CrmRecordSupport.code(activity.getStatus(), "PLANNED", STATUSES, "活动状态"));
        activity.setPriority(CrmRecordSupport.code(activity.getPriority(), "MEDIUM", Set.of("HIGH", "MEDIUM", "LOW"), "优先级"));
        activity.setAllDayFlag(CrmRecordSupport.flag(activity.getAllDayFlag()));
        if ("CALL".equals(activity.getActivityType())) {
            activity.setDirection(CrmRecordSupport.code(activity.getDirection(), "OUTBOUND", Set.of("INBOUND", "OUTBOUND"), "通话方向"));
        } else activity.setDirection(null);
        CrmRecordSupport.require(activity.getStartTime(), "开始时间不能为空");
        CrmRecordSupport.require(activity.getEndTime(), "结束时间不能为空");
        if (activity.getEndTime().isBefore(activity.getStartTime())) throw new CrmBusinessException("结束时间不能早于开始时间");
        activity.setDurationMinutes(Math.toIntExact(ChronoUnit.MINUTES.between(activity.getStartTime(), activity.getEndTime())));
        refreshOverdueFlag(activity, LocalDateTime.now());
        activity.setBizType(CrmRecordSupport.code(activity.getBizType(), "NONE",
                Set.of("CUSTOMER", "OPPORTUNITY", "LEAD", "TICKET", "CONTRACT", "QUOTE", "NONE"), "挂载类型"));
        Long linkedCustomer = references.businessCustomer(activity.getBizType(), activity.getBizId());
        if (linkedCustomer != null && activity.getCustomerId() != null && !linkedCustomer.equals(activity.getCustomerId())) {
            throw new CrmBusinessException("活动客户与挂载对象所属客户不一致");
        }
        if (linkedCustomer != null) activity.setCustomerId(linkedCustomer);
        if (activity.getCustomerId() != null) activity.setCustomerName(references.customer(activity.getCustomerId()).getCustomerName());
        else activity.setCustomerName(null);
        Long ownerId = activity.getOwnerId() == null ? (original == null ? UserContext.getUserId() : original.getOwnerId()) : activity.getOwnerId();
        CrmRecordSupport.require(ownerId, "负责人不能为空");
        if (original != null && !Objects.equals(ownerId, original.getOwnerId()) && !StpUtil.hasPermission("crm:activity:assign")) {
            throw new CrmBusinessException("无权调整活动负责人");
        }
        if (Objects.equals(ownerId, UserContext.getUserId())) {
            activity.setOwnerName(UserContext.getUserName()); activity.setDeptId(UserContext.getDeptId());
        } else {
            if (original == null && !StpUtil.hasPermission("crm:activity:assign")) throw new CrmBusinessException("无权为他人分配活动");
            HrEmployeeSummaryVO owner = references.user(ownerId);
            activity.setOwnerName(owner.getEmployeeName()); activity.setDeptId(owner.getDeptId());
        }
        activity.setOwnerId(ownerId);
    }

    private void saveParticipants(CrmActivity activity, List<CrmActivityParticipant> members) {
        if (members.size() > 100) throw new CrmBusinessException("参与人不能超过100人");
        Set<String> seen = new HashSet<>();
        Map<String, CrmActivityParticipant> previous = new HashMap<>();
        // The activity lock serializes writes; a locking read also bypasses an older transaction snapshot.
        participantMapper.lockActiveByActivity(activity.getActivityId()).forEach(member -> previous.put(member.getParticipantType() + ":" + member.getParticipantRefId(), member));
        participantMapper.deactivateByActivity(activity.getActivityId());
        for (CrmActivityParticipant member : members) {
            CrmRecordSupport.require(member, "参与人不能为空");
            member.setParticipantType(CrmRecordSupport.code(member.getParticipantType(), null, Set.of("USER", "CONTACT", "LEAD"), "参与人类型"));
            CrmRecordSupport.require(member.getParticipantRefId(), "参与人ID不能为空");
            String key = member.getParticipantType() + ":" + member.getParticipantRefId();
            if (!seen.add(key)) throw new CrmBusinessException("参与人重复");
            member.setParticipantName(switch (member.getParticipantType()) {
                case "USER" -> Objects.equals(member.getParticipantRefId(), UserContext.getUserId())
                        ? UserContext.getUserName() : references.user(member.getParticipantRefId()).getEmployeeName();
                case "CONTACT" -> references.contact(member.getParticipantRefId()).getContactName();
                default -> references.lead(member.getParticipantRefId()).getContactName();
            });
            CrmActivityParticipant old = previous.get(key);
            if ("USER".equals(member.getParticipantType()) && !Objects.equals(member.getParticipantRefId(), UserContext.getUserId())) {
                member.setAcceptanceStatus(old == null ? "NONE" : old.getAcceptanceStatus());
                member.setResponseTime(old == null ? null : old.getResponseTime());
            } else {
                member.setAcceptanceStatus(CrmRecordSupport.code(member.getAcceptanceStatus(), "NONE", ACCEPTANCE_STATUSES, "接受状态"));
                member.setResponseTime("NONE".equals(member.getAcceptanceStatus()) ? null
                        : old != null && Objects.equals(old.getAcceptanceStatus(), member.getAcceptanceStatus()) ? old.getResponseTime() : LocalDateTime.now());
            }
            member.setIsOrganizerFlag(CrmRecordSupport.flag(member.getIsOrganizerFlag()));
            member.setAttendFlag(CrmRecordSupport.flag(member.getAttendFlag()));
            CrmRecordSupport.create(member, "participantId");
            member.setActivityId(activity.getActivityId());
            participantMapper.upsertParticipant(member);
        }
    }

    private void saveReminders(CrmActivity activity, List<CrmActivityReminder> requested, List<CrmActivityReminder> previous) {
        if (requested.size() > 10) throw new CrmBusinessException("提醒不能超过10项");
        Set<String> seen = new HashSet<>();
        Map<String, CrmActivityReminder> existing = new HashMap<>();
        previous.forEach(reminder -> existing.put(reminder.getChannelType() + ":" + reminder.getRemindMinutesBefore(), reminder));
        for (CrmActivityReminder reminder : requested) {
            CrmRecordSupport.require(reminder.getRemindMinutesBefore(), "提前分钟数不能为空");
            if (reminder.getRemindMinutesBefore() < 0) throw new CrmBusinessException("提前分钟数不能为负");
            reminder.setChannelType(CrmRecordSupport.code(reminder.getChannelType(), "INTERNAL", Set.of("INTERNAL", "EMAIL"), "提醒渠道"));
            if (!seen.add(reminder.getChannelType() + ":" + reminder.getRemindMinutesBefore())) continue;
            // Unchanged settings keep their identity so a queued reminder remains valid after an ordinary edit.
            if (existing.containsKey(reminder.getChannelType() + ":" + reminder.getRemindMinutesBefore())) continue;
            CrmRecordSupport.create(reminder, "reminderId");
            reminder.setActivityId(activity.getActivityId()); reminder.setSentFlag(0);
            reminder.setSendTime(null); reminder.setMessageRecordId(null);
            reminderMapper.insert(reminder);
        }
        List<Long> removed = previous.stream().filter(reminder -> !seen.contains(reminder.getChannelType() + ":" + reminder.getRemindMinutesBefore()))
                .map(CrmActivityReminder::getReminderId).toList();
        if (!removed.isEmpty()) reminderMapper.delete(new LambdaQueryWrapper<CrmActivityReminder>()
                .eq(CrmActivityReminder::getActivityId, activity.getActivityId()).in(CrmActivityReminder::getReminderId, removed));
    }

    private void completeLinks(CrmActivity activity, boolean generateFollowUp) {
        if ("OPPORTUNITY".equals(activity.getBizType())) {
            opportunityMapper.update(null, new LambdaUpdateWrapper<com.cloudflow.crm.domain.CrmOpportunity>()
                    .eq(com.cloudflow.crm.domain.CrmOpportunity::getOpportunityId, activity.getBizId())
                    .and(condition -> condition.isNull(com.cloudflow.crm.domain.CrmOpportunity::getLatestFollowUpTime)
                            .or().lt(com.cloudflow.crm.domain.CrmOpportunity::getLatestFollowUpTime, activity.getCompleteTime()))
                    .set(com.cloudflow.crm.domain.CrmOpportunity::getLatestFollowUpTime, activity.getCompleteTime()));
        }
        if (generateFollowUp && activity.getFollowUpId() == null) {
            if (activity.getCustomerId() == null) throw new CrmBusinessException("生成跟进记录需要关联客户");
            CrmFollowUp followUp = new CrmFollowUp();
            followUp.setCustomerId(activity.getCustomerId());
            if ("OPPORTUNITY".equals(activity.getBizType())) followUp.setOpportunityId(activity.getBizId());
            followUp.setFollowUpType("CALL".equals(activity.getActivityType()) ? "PHONE" : "VISIT");
            followUp.setFollowUpTime(activity.getCompleteTime());
            followUp.setContent(CrmRecordSupport.text(activity.getResultSummary(), 1000, "结果纪要"));
            followUp.setResultSummary(activity.getResultSummary());
            followUp.setOwnerId(activity.getOwnerId()); followUp.setOwnerName(activity.getOwnerName());
            if (!followUpService.createFollowUp(followUp)) throw new IllegalStateException("创建跟进记录失败");
            activity.setFollowUpId(followUp.getFollowUpId());
            CrmRecordSupport.saved(activityMapper.updateById(activity));
        }
        if (activity.getCustomerId() != null) {
            customerMapper.update(null, new LambdaUpdateWrapper<CrmCustomer>().eq(CrmCustomer::getCustomerId, activity.getCustomerId())
                    .and(condition -> condition.isNull(CrmCustomer::getLastFollowUpTime).or().lt(CrmCustomer::getLastFollowUpTime, activity.getCompleteTime()))
                    .set(CrmCustomer::getLastFollowUpTime, activity.getCompleteTime()));
        }
        if ("LEAD".equals(activity.getBizType())) {
            leadMapper.update(null, new LambdaUpdateWrapper<CrmLead>().eq(CrmLead::getLeadId, activity.getBizId())
                    .set(CrmLead::getLastFollowUpTime, activity.getCompleteTime()));
        }
    }

    public List<CrmActivityParticipant> participants(Long id) {
        return participantMapper.selectList(new LambdaQueryWrapper<CrmActivityParticipant>().eq(CrmActivityParticipant::getActivityId, id)
                .orderByAsc(CrmActivityParticipant::getParticipantId));
    }

    public List<CrmActivityReminder> reminders(Long id) {
        return reminderMapper.selectList(new LambdaQueryWrapper<CrmActivityReminder>().eq(CrmActivityReminder::getActivityId, id)
                .orderByAsc(CrmActivityReminder::getReminderId));
    }

    private CrmActivity writable(Long id) {
        CrmActivity activity = accessible(id);
        assertWritable(activity);
        return activity;
    }

    private void assertWritable(CrmActivity activity) {
        if (!Objects.equals(activity.getOwnerId(), UserContext.getUserId()) && !StpUtil.hasPermission("crm:activity:assign")) {
            throw new CrmBusinessException("只有负责人或活动管理员可以修改活动");
        }
    }

    private List<CrmActivity> conflicts(CrmActivity activity, List<CrmActivityParticipant> participants) {
        if (TERMINAL_STATUSES.contains(activity.getStatus()) || !activity.getEndTime().isAfter(activity.getStartTime())) return List.of();
        Set<Long> people = new LinkedHashSet<>();
        people.add(activity.getOwnerId());
        for (CrmActivityParticipant participant : participants) {
            if ("USER".equals(participant.getParticipantType()) && !"DECLINED".equals(participant.getAcceptanceStatus())) {
                people.add(participant.getParticipantRefId());
            }
        }
        List<Long> userIds = List.copyOf(people);
        Map<Long, CrmActivity> visible = new HashMap<>();
        LocalDateTime now = LocalDateTime.now();
        for (CrmActivity other : activityMapper.selectConflictingAccessible(activity, userIds, UserContext.getUserId(),
                activityReadScope())) {
            refreshOverdueFlag(other, now);
            visible.put(other.getActivityId(), other);
        }
        List<CrmActivity> conflicts = new ArrayList<>();
        for (CrmActivity period : activityMapper.selectConflictingPeriods(activity, userIds)) {
            CrmActivity readable = visible.get(period.getActivityId());
            if (readable != null) conflicts.add(readable);
            else {
                // Shared participants expose busy times, never identifiers or content of an unreadable activity.
                CrmActivity busy = new CrmActivity();
                busy.setSubject("忙碌时段"); busy.setStartTime(period.getStartTime()); busy.setEndTime(period.getEndTime());
                conflicts.add(busy);
            }
        }
        return conflicts;
    }

    @Audit(name = "变更CRM活动状态", diff = true)
    @Transactional(rollbackFor = Exception.class)
    public CrmActivityDetailVO changeStatus(Long id, String status, Integer version, String summary, String nextAction, boolean generateFollowUp) {
        CrmActivity activity = writable(id);
        activity.setVersion(version); activity.setStatus(status);
        if (summary != null) activity.setResultSummary(summary);
        if (nextAction != null) activity.setNextAction(nextAction);
        CrmActivityRequest request = new CrmActivityRequest(); request.setActivity(activity); request.setGenerateFollowUp(generateFollowUp);
        return save(request);
    }

    @Audit(name = "创建后续CRM活动")
    @Transactional(rollbackFor = Exception.class)
    public CrmActivityDetailVO next(Long id, CrmActivityRequest request) {
        CrmActivity source = writable(id);
        CrmActivity target = request.getActivity(); target.setActivityId(null);
        String nextAction = source.getNextAction();
        String defaultSubject = org.springframework.util.StringUtils.hasText(nextAction) && nextAction.length() <= 200
                ? nextAction : source.getSubject();
        target.setSubject(CrmRecordSupport.text(org.springframework.util.StringUtils.hasText(target.getSubject()) ? target.getSubject() : defaultSubject, 200, "后续活动主题"));
        if (target.getDescription() == null) target.setDescription(nextAction);
        target.setBizType(source.getBizType()); target.setBizId(source.getBizId()); target.setCustomerId(source.getCustomerId());
        target.setOwnerId(source.getOwnerId()); target.setStatus("PLANNED");
        return save(request);
    }

    @Audit(name = "删除CRM活动", highRisk = true)
    @Transactional(rollbackFor = Exception.class)
    public void delete(Long id) {
        writable(id); assertWritable(CrmRecordSupport.require(activityMapper.lockById(id), "活动不存在"));
        reminderMapper.delete(new LambdaQueryWrapper<CrmActivityReminder>().eq(CrmActivityReminder::getActivityId, id).eq(CrmActivityReminder::getSentFlag, 0));
        participantMapper.deactivateByActivity(id);
        CrmRecordSupport.saved(activityMapper.deleteById(id));
    }

    @Audit(name = "回复CRM活动邀请")
    @Transactional(rollbackFor = Exception.class)
    public void respond(Long id, String acceptanceStatus) {
        accessible(id); CrmRecordSupport.require(activityMapper.lockById(id), "活动不存在");
        String value = CrmRecordSupport.code(acceptanceStatus, null, ACCEPTANCE_STATUSES, "接受状态");
        CrmActivityParticipant member = CrmRecordSupport.require(participantMapper.lockActiveByActivity(id).stream()
                .filter(participant -> "USER".equals(participant.getParticipantType())
                        && Objects.equals(participant.getParticipantRefId(), UserContext.getUserId()))
                .findFirst().orElse(null), "您已不在活动参与人中");
        int updated = participantMapper.update(null, new LambdaUpdateWrapper<CrmActivityParticipant>()
                .eq(CrmActivityParticipant::getParticipantId, member.getParticipantId())
                .set(CrmActivityParticipant::getAcceptanceStatus, value)
                .set(CrmActivityParticipant::getResponseTime, "NONE".equals(value) ? null : LocalDateTime.now()));
        CrmRecordSupport.saved(updated);
    }

    public PageResult<CrmTimelineItemVO> timeline(Long customerId, String type, PageQuery page) {
        references.customer(customerId);
        List<CrmTimelineItemVO> items = timelineMapper.selectCustomerTimeline(customerId, CrmRecordSupport.tenantId(), UserContext.getUserId(),
                DataScopeUtils.listScope("dept_id", "owner_id")).stream()
                .filter(item -> type == null || type.isBlank() || type.equals(item.getType()))
                .sorted(Comparator.comparing(CrmTimelineItemVO::getEventTime, Comparator.nullsLast(Comparator.reverseOrder()))
                        .thenComparing(CrmTimelineItemVO::getType).thenComparing(CrmTimelineItemVO::getSourceId, Comparator.reverseOrder())).toList();
        Page<Object> paging = page.build();
        int from = (int) Math.min(items.size(), Math.max(0, paging.offset()));
        int to = (int) Math.min(items.size(), from + paging.getSize());
        return new PageResult<>(items.subList(from, to), items.size(), paging.getCurrent(), paging.getSize());
    }
}
