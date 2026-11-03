package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.datascope.DataScope;
import com.cloudflow.common.datascope.DataScopeHandle;
import cn.dev33.satoken.stp.StpUtil;
import com.cloudflow.oa.domain.OaMeetingAttendance;
import com.cloudflow.oa.domain.OaMeetingMinutes;
import com.cloudflow.oa.domain.WorkTask;
import com.cloudflow.oa.domain.dto.OaMeetingDecision;
import com.cloudflow.oa.domain.SysScheduleEvent;
import com.cloudflow.oa.domain.vo.OaIdentityReference;
import com.cloudflow.oa.mapper.OaMeetingAttendanceMapper;
import com.cloudflow.oa.mapper.OaMeetingMinutesMapper;
import com.cloudflow.oa.mapper.OaIdentityReferenceMapper;
import com.cloudflow.oa.service.IOaMeetingMinutesService;
import com.cloudflow.oa.service.IWorkTaskService;
import com.cloudflow.common.audit.annotation.Audit;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Set;

/**
 * OA-P1-2 会议纪要 + 出席记录实现。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class OaMeetingMinutesServiceImpl implements IOaMeetingMinutesService {

    private final OaMeetingMinutesMapper minutesMapper;
    private final OaMeetingAttendanceMapper attendanceMapper;
    private final IWorkTaskService workTaskService;
    private final ObjectMapper objectMapper;
    private final OaMeetingAccess meetingAccess;
    private final OaIdentityReferenceMapper identities;
    private final DataScopeHandle dataScopes;

    @Override
    public Page<OaMeetingMinutes> page(String keyword, String status, Long scheduleEventId, Integer pageNum, Integer pageSize) {
        OaMeetingRules.require(pageNum != null && pageNum > 0 && pageSize != null && pageSize > 0 && pageSize <= 50,
                "MEETING_PAGE_INVALID", "页码须大于0，每页最多50条");
        DataScope scope = new DataScope();
        boolean manager = StpUtil.hasPermission("oa:meeting:manage");
        boolean all = manager && Boolean.TRUE.equals(dataScopes.calcScope(scope));
        return minutesMapper.visiblePage(new Page<>(pageNum, pageSize), OaRecordSupport.tenantId(), keyword, status, scheduleEventId,
                OaMeetingAccess.userId(), all, manager ? scope.getUserId() : null, manager ? scope.getDeptList() : List.of());
    }

    @Override
    public OaMeetingMinutes getDetail(Long id) {
        OaMeetingMinutes minutes = id == null ? null : minutesMapper.selectById(id);
        if (minutes == null || !Objects.equals(minutes.getTenantId(), OaRecordSupport.tenantId()) || !Integer.valueOf(0).equals(minutes.getDeleted())) throw unavailable();
        Long eventId = minutes.getScheduleEventId();
        if (eventId != null && !meetingAccess.visible(meetingAccess.get(eventId))) throw unavailable();
        return minutes;
    }

    @Override
    @Transactional
    public boolean save(OaMeetingMinutes minutes) {
        OaRecordSupport.require(minutes, "纪要不能为空");
        Long eventId = minutes.getScheduleEventId();
        if (eventId != null) {
            SysScheduleEvent event = lockEvent(eventId);
            requireOccurred(event);
            if (!minutesMapper.forEvent(OaRecordSupport.tenantId(), eventId).isEmpty()) throw new ServiceException("本会议已有纪要，请打开原纪要维护", 409);
            association(minutes, event);
        } else organizer(minutes);
        minutes.setMeetingTitle(OaRecordSupport.text(minutes.getMeetingTitle(), 200, "会议标题"));
        minutes.setDecisions(normalizeDraftDecisions(minutes.getDecisions()));
        OaRecordSupport.create(minutes, "id"); minutes.setStatus("DRAFT"); minutes.setConfirmedTime(null);
        OaRecordSupport.saved(minutesMapper.insert(minutes));
        if (eventId != null) minutesMapper.bindAttendance(OaRecordSupport.tenantId(), eventId, minutes.getId());
        return true;
    }

    @Override
    @Transactional
    @Audit(name = "更新会议纪要", highRisk = true)
    public boolean update(OaMeetingMinutes minutes) {
        OaRecordSupport.require(minutes, "纪要不能为空");
        OaMeetingMinutes original = lock(minutes.getId());
        OaMeetingAccess.version(minutes.getVersion(), original.getVersion());
        if ("CONFIRMED".equals(original.getStatus())) throw new ServiceException("已确认纪要不能直接编辑", 409);
        if (!Objects.equals(minutes.getScheduleEventId(), original.getScheduleEventId())) throw new ServiceException("纪要关联的会议不可修改", 409);
        if (original.getScheduleEventId() == null) {
            original.setMeetingTitle(OaRecordSupport.text(minutes.getMeetingTitle(), 200, "会议标题"));
            original.setMeetingTime(minutes.getMeetingTime()); original.setRoomId(minutes.getRoomId()); original.setLocation(minutes.getLocation());
            original.setOrganizerId(minutes.getOrganizerId()); organizer(original);
        }
        original.setMinutesContent(minutes.getMinutesContent()); original.setDecisions(normalizeDraftDecisions(minutes.getDecisions())); original.setAttachmentUrl(minutes.getAttachmentUrl());
        OaRecordSupport.touch(original); OaRecordSupport.saved(minutesMapper.updateById(original));
        return true;
    }

    @Override
    @Transactional
    @Audit(name = "删除会议纪要", highRisk = true)
    public boolean remove(Long id) {
        OaMeetingMinutes exist = lock(id);
        OaRecordSupport.saved(minutesMapper.update(null, new LambdaUpdateWrapper<OaMeetingMinutes>()
                .eq(OaMeetingMinutes::getId, id).eq(OaMeetingMinutes::getTenantId, OaRecordSupport.tenantId())
                .eq(OaMeetingMinutes::getVersion, exist.getVersion())
                .set(OaMeetingMinutes::getDeleted, 1).set(OaMeetingMinutes::getVersion, exist.getVersion() + 1)
                .set(OaMeetingMinutes::getUpdateBy, UserContext.getUserName())
                .set(OaMeetingMinutes::getUpdateTime, LocalDateTime.now())));
        if (exist.getScheduleEventId() != null) minutesMapper.unlinkAttendance(OaRecordSupport.tenantId(), id);
        return true;
    }

    @Override
    @Transactional
    public boolean confirm(Long id) {
        OaMeetingMinutes exist = lock(id);
        if ("CONFIRMED".equals(exist.getStatus())) return true;
        exist.setStatus("CONFIRMED");
        exist.setConfirmedTime(LocalDateTime.now());
        exist.setUpdateBy(UserContext.getUserName());
        exist.setUpdateTime(LocalDateTime.now());
        return minutesMapper.updateById(exist) > 0;
    }

    @Override
    public List<OaMeetingAttendance> listAttendance(Long minutesId) {
        getDetail(minutesId);
        return attendanceMapper.selectList(new LambdaQueryWrapper<OaMeetingAttendance>()
                .eq(OaMeetingAttendance::getTenantId, OaRecordSupport.tenantId())
                .eq(OaMeetingAttendance::getMinutesId, minutesId)
                .eq(OaMeetingAttendance::getDeleted, 0)
                .orderByAsc(OaMeetingAttendance::getId));
    }

    @Override
    @Transactional
    public boolean upsertAttendance(OaMeetingAttendance attendance) {
        if (attendance == null || attendance.getMinutesId() == null || attendance.getUserId() == null) {
            throw new IllegalArgumentException("纪要ID与参会人ID必填");
        }
        OaMeetingMinutes minutes = lock(attendance.getMinutesId());
        Long eventId = minutes.getScheduleEventId();
        String status = OaRecordSupport.code(attendance.getAttendStatus(), "NOT_CHECKED", Set.of("ATTEND", "ABSENT", "LATE", "LEAVE", "NOT_CHECKED"));
        OaIdentityReference user = OaRecordSupport.require(identities.user(attendance.getUserId(), OaRecordSupport.tenantId()), "参会人员不存在或已停用");
        OaMeetingAttendance exist;
        if (eventId != null) {
            requireOccurred(meetingAccess.get(eventId));
            exist = minutesMapper.eventAttendance(OaRecordSupport.tenantId(), eventId, attendance.getUserId());
            if (exist == null || !Integer.valueOf(0).equals(exist.getDeleted())) throw new ServiceException("该人员不在本会议有效邀请名单内", 409);
        } else {
            exist = minutesMapper.minutesAttendance(OaRecordSupport.tenantId(), minutes.getId(), attendance.getUserId());
        }
        if (exist != null) {
            exist.setMinutesId(minutes.getId()); exist.setAttendStatus(status); exist.setDeleted(0);
            exist.setCheckInTime("NOT_CHECKED".equals(status) ? null : attendance.getCheckInTime());
            exist.setRemark(attendance.getRemark());
            exist.setUserName(user.getName());
            exist.setUpdateBy(UserContext.getUserName());
            exist.setUpdateTime(LocalDateTime.now());
            OaRecordSupport.saved(minutesMapper.saveAttendance(exist)); return true;
        }
        OaMeetingAttendance created = new OaMeetingAttendance(); OaRecordSupport.create(created, "id");
        created.setMinutesId(minutes.getId()); created.setUserId(attendance.getUserId()); created.setUserName(user.getName());
        created.setAttendStatus(status); created.setCheckInTime("NOT_CHECKED".equals(status) ? null : attendance.getCheckInTime());
        created.setRemark(attendance.getRemark()); created.setAcceptanceStatus("NONE"); created.setInvitationVersion(0);
        OaRecordSupport.saved(attendanceMapper.insert(created)); return true;
    }

    @Override
    @Transactional
    @Audit(name = "删除会议纪要参会记录", highRisk = true)
    public boolean removeAttendance(Long id) {
        OaMeetingAttendance observed = id == null ? null : attendanceMapper.selectById(id);
        if (observed == null || !Objects.equals(observed.getTenantId(), OaRecordSupport.tenantId()) || observed.getMinutesId() == null) throw unavailable();
        OaMeetingMinutes minutes = lock(observed.getMinutesId());
        OaMeetingAttendance exist = minutesMapper.lockAttendance(OaRecordSupport.tenantId(), id);
        if (exist == null || !Objects.equals(exist.getMinutesId(), minutes.getId())) throw unavailable();
        if (minutes.getScheduleEventId() == null) exist.setDeleted(1);
        else { exist.setAttendStatus("NOT_CHECKED"); exist.setCheckInTime(null); exist.setRemark(null); }
        exist.setUpdateBy(UserContext.getUserName());
        exist.setUpdateTime(LocalDateTime.now());
        OaRecordSupport.saved(minutesMapper.saveAttendance(exist)); return true;
    }

    @Override
    @Transactional
    public List<Long> dispatchDecisionsToWorkTasks(Long minutesId, List<OaMeetingDecision> decisionOverrides) {
        OaMeetingMinutes minutes = lock(minutesId);
        if (!"CONFIRMED".equals(minutes.getStatus())) throw new ServiceException("请先确认会议纪要，再派发决议项", 409);
        List<OaMeetingDecision> persisted = parseDecisionsJson(minutes.getDecisions());
        List<OaMeetingDecision> decisions = new ArrayList<>(decisionOverrides == null || decisionOverrides.isEmpty() ? persisted : decisionOverrides);
        if (decisions.size() != persisted.size()) throw new ServiceException("决议项已变化，请刷新纪要后重试", 409);
        List<Long> taskIds = new ArrayList<>();
        for (int index = 0; index < decisions.size(); index++) {
            OaMeetingDecision stored = persisted.get(index);
            OaMeetingDecision decision = OaRecordSupport.require(decisions.get(index), "决议项不能为空");
            if (stored.getWorkTaskId() != null) {
                decisions.set(index, stored);
                taskIds.add(stored.getWorkTaskId());
                continue;
            }
            if (decision.getWorkTaskId() != null) throw new ServiceException("任务编号由服务端派发生成", 400);
            validateDecision(decision);
            Long ownerId = decision.getOwnerId() == null ? minutes.getOrganizerId() : decision.getOwnerId();
            OaIdentityReference owner = OaRecordSupport.require(identities.user(ownerId, minutes.getTenantId()), "决议负责人不存在或已停用");
            WorkTask task = new WorkTask();
            task.setTenantId(minutes.getTenantId());
            task.setTitle(decision.getTitle());
            String origin = "来源会议: " + minutes.getMeetingTitle();
            task.setDescription(StringUtils.hasText(decision.getRemark()) ? origin + "\n" + decision.getRemark() : origin);
            task.setAssigneeId(ownerId); task.setOwnerId(minutes.getOrganizerId());
            task.setPriority(1); task.setStatus("TODO");
            if (decision.getDueDate() != null) task.setDueDate(decision.getDueDate().atStartOfDay());
            task.setCreateBy(UserContext.getUserName()); task.setUpdateBy(UserContext.getUserName());
            task.setCreateTime(LocalDateTime.now()); task.setUpdateTime(task.getCreateTime());
            if (!workTaskService.save(task)) throw new IllegalStateException("会议决议任务保存失败");
            taskIds.add(task.getTaskId());
            decision.setOwnerId(ownerId); decision.setOwnerName(owner.getName());
            decision.setWorkTaskId(task.getTaskId()); decision.setStatus("DISPATCHED");
        }
        minutes.setDecisions(writeDecisions(decisions));
        OaRecordSupport.touch(minutes);
        OaRecordSupport.saved(minutesMapper.updateById(minutes));
        return taskIds;
    }

    private SysScheduleEvent lockEvent(Long id) {
        SysScheduleEvent observed = meetingAccess.get(id);
        meetingAccess.lockRooms(java.util.Collections.singletonList(observed.getRoomId()));
        SysScheduleEvent event = meetingAccess.lock(observed);
        OaMeetingAttendance invitation = minutesMapper.eventAttendance(OaRecordSupport.tenantId(), id, OaMeetingAccess.userId());
        if (!Objects.equals(event.getCreatorId(), OaMeetingAccess.userId()) && !meetingAccess.manageable(event)
                && (invitation == null || !Integer.valueOf(0).equals(invitation.getDeleted()))) throw unavailable();
        return event;
    }

    private OaMeetingMinutes lock(Long id) {
        OaMeetingMinutes observed = getDetail(id);
        Long eventId = observed.getScheduleEventId();
        if (eventId != null) lockEvent(eventId);
        OaMeetingMinutes minutes = minutesMapper.lock(OaRecordSupport.tenantId(), id);
        if (minutes == null || !Objects.equals(eventId, minutes.getScheduleEventId())) throw unavailable();
        return minutes;
    }

    private void requireOccurred(SysScheduleEvent event) {
        boolean occurred = Set.of("IN_PROGRESS", "COMPLETED").contains(event.getStatus())
                || "CANCELLED".equals(event.getStatus()) && Set.of("NOT_REQUIRED", "APPROVED").contains(event.getApprovalStatus());
        if (!"MEETING".equals(event.getType()) || "SERIES".equals(event.getRecurrenceRole()) || !occurred) {
            throw new ServiceException("纪要和签到只能关联已经开始的实际会议，不能关联周期主记录或未举行会议", 409);
        }
    }

    private void association(OaMeetingMinutes minutes, SysScheduleEvent event) {
        minutes.setScheduleEventId(event.getEventId()); minutes.setMeetingTitle(event.getTitle());
        minutes.setMeetingTime(event.getStartTime()); minutes.setRoomId(event.getRoomId() == null ? null : event.getRoomId().toString());
        minutes.setOrganizerId(event.getCreatorId()); organizer(minutes);
    }

    private void organizer(OaMeetingMinutes minutes) {
        Long userId = minutes.getOrganizerId() == null ? OaMeetingAccess.userId() : minutes.getOrganizerId();
        OaIdentityReference user = OaRecordSupport.require(identities.user(userId, OaRecordSupport.tenantId()), "组织者不存在或已停用");
        minutes.setOrganizerId(userId); minutes.setOrganizerName(user.getName());
    }

    private ServiceException unavailable() { return new ServiceException("会议纪要不存在或无权访问", 404); }

    private List<OaMeetingDecision> parseDecisionsJson(String json) {
        if (!StringUtils.hasText(json)) return new ArrayList<>();
        try {
            List<OaMeetingDecision> decisions = objectMapper.readerFor(new TypeReference<List<OaMeetingDecision>>() {})
                    .with(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES).readValue(json);
            return OaRecordSupport.require(decisions, "决议必须是数组");
        } catch (JsonProcessingException failure) {
            throw new ServiceException("决议格式无效，请检查负责人和截止日期", 400);
        }
    }

    private String normalizeDraftDecisions(String json) {
        List<OaMeetingDecision> decisions = parseDecisionsJson(json);
        for (OaMeetingDecision decision : decisions) {
            validateDecision(decision);
            if (decision.getWorkTaskId() != null) throw new ServiceException("任务编号由服务端派发生成", 400);
            decision.setStatus("PENDING");
        }
        return writeDecisions(decisions);
    }

    private void validateDecision(OaMeetingDecision decision) {
        OaRecordSupport.require(decision, "决议项不能为空");
        decision.setTitle(OaRecordSupport.text(decision.getTitle(), 200, "决议标题"));
        if (decision.getOwnerId() != null && decision.getOwnerId() <= 0) throw new ServiceException("决议负责人标识无效", 400);
    }

    private String writeDecisions(List<OaMeetingDecision> decisions) {
        try {
            return objectMapper.writeValueAsString(decisions);
        } catch (JsonProcessingException failure) {
            throw new IllegalStateException("会议决议保存失败", failure);
        }
    }
}
