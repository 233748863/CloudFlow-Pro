package com.cloudflow.oa.service.impl;

import cn.dev33.satoken.stp.StpUtil;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.datascope.DataScopeUtils;
import com.cloudflow.oa.domain.MeetingRoom;
import com.cloudflow.oa.domain.SysScheduleEvent;
import com.cloudflow.oa.mapper.OaMeetingMapper;
import com.cloudflow.oa.mapper.SysScheduleEventMapper;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Component
@RequiredArgsConstructor
public class OaMeetingAccess {
    private final OaMeetingMapper meetings;
    private final SysScheduleEventMapper events;

    public SysScheduleEvent get(Long id) {
        SysScheduleEvent event = id == null ? null : events.selectById(id);
        if (event == null || !Objects.equals(event.getTenantId(), OaRecordSupport.tenantId()) || Integer.valueOf(1).equals(event.getDeleted())) throw unavailable();
        return event;
    }

    public Map<Long, MeetingRoom> lockRooms(Collection<Long> ids) {
        transaction();
        Map<Long, MeetingRoom> result = new LinkedHashMap<>();
        for (Long id : ids.stream().filter(Objects::nonNull).distinct().sorted().toList()) {
            MeetingRoom room = meetings.lockRoom(OaRecordSupport.tenantId(), id);
            if (room == null || !Objects.equals(room.getTenantId(), OaRecordSupport.tenantId())) throw new ServiceException("ROOM_UNAVAILABLE: 会议室不存在或不可核实", 404);
            result.put(id, room);
        }
        return result;
    }

    public SysScheduleEvent lock(SysScheduleEvent observed) {
        transaction();
        SysScheduleEvent event = meetings.lockEvent(OaRecordSupport.tenantId(), observed.getEventId());
        if (event == null) throw unavailable();
        if (!Objects.equals(event.getRoomId(), observed.getRoomId())) throw conflict();
        return event;
    }

    public void own(SysScheduleEvent event) {
        if (!Objects.equals(event.getCreatorId(), userId())) throw new ServiceException("MEETING_OWNER_REQUIRED: 只能操作本人发起的会议", 403);
    }

    public boolean visible(SysScheduleEvent event) {
        if (Objects.equals(event.getCreatorId(), userId())) return true;
        if (meetings.attendees(OaRecordSupport.tenantId(), event.getEventId()).stream()
                .anyMatch(invitation -> Objects.equals(invitation.getUserId(), userId()) && Integer.valueOf(0).equals(invitation.getDeleted()))) return true;
        return manageable(event);
    }

    public boolean manageable(SysScheduleEvent event) {
        return StpUtil.hasPermission("oa:meeting:manage") && meetings.visibleToManager(OaRecordSupport.tenantId(), event.getEventId(),
                DataScopeUtils.listScope("dept_id", "creator_id")) != null;
    }

    public void save(SysScheduleEvent event) {
        transaction();
        event.setUpdateTime(LocalDateTime.now());
        if (meetings.saveEvent(event) != 1) throw conflict();
        event.setVersion(Math.addExact(event.getVersion(), 1));
    }

    public static void version(Integer requested, Integer actual) { if (requested == null || !Objects.equals(requested, actual)) throw conflict(); }
    public static Long userId() { Long userId = UserContext.getUserId(); if (userId == null) throw new ServiceException("登录上下文缺失", 401); return userId; }
    public static ServiceException unavailable() { return new ServiceException("MEETING_NOT_FOUND: 会议不存在或无权访问", 404); }
    public static ServiceException conflict() { return new ServiceException("MEETING_VERSION_CONFLICT: 会议或会议室已改变，请刷新重试", 409); }
    public static void transaction() { if (!TransactionSynchronizationManager.isActualTransactionActive()) throw new IllegalStateException("会议写入必须在数据库事务内执行"); }
}
