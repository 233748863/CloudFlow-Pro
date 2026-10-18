package com.cloudflow.oa.service.impl;

import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.oa.domain.OaMeetingAttendance;
import com.cloudflow.oa.domain.SysScheduleEvent;
import com.cloudflow.oa.domain.dto.MeetingCommands;
import com.cloudflow.oa.domain.vo.OaIdentityReference;
import com.cloudflow.oa.mapper.OaIdentityReferenceMapper;
import com.cloudflow.oa.mapper.OaMeetingAttendanceMapper;
import com.cloudflow.oa.mapper.OaMeetingMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class OaMeetingInvitationService {
    private final OaMeetingMapper meetings;
    private final OaMeetingAttendanceMapper attendance;
    private final OaIdentityReferenceMapper identities;
    private final ObjectMapper json;

    public void synchronize(SysScheduleEvent event, List<Long> userIds) {
        OaMeetingAccess.transaction();
        Map<Long, OaMeetingAttendance> previous = new LinkedHashMap<>();
        meetings.attendees(event.getTenantId(), event.getEventId()).forEach(invitation -> previous.put(invitation.getUserId(), invitation));
        for (Long userId : userIds) {
            OaIdentityReference user = OaRecordSupport.require(identities.user(userId, event.getTenantId()), "参会人不存在或已停用");
            OaMeetingAttendance invitation = previous.remove(userId);
            if (invitation == null) {
                invitation = new OaMeetingAttendance();
                OaRecordSupport.create(invitation, "id");
                invitation.setScheduleEventId(event.getEventId()); invitation.setMeetingId(event.getEventId());
                invitation.setUserId(userId); invitation.setUserName(user.getName()); invitation.setAttendStatus("NOT_CHECKED");
                invitation.setAcceptanceStatus("NONE"); invitation.setInvitationVersion(event.getScheduleVersion());
                OaRecordSupport.saved(attendance.insert(invitation));
            } else if (!Objects.equals(invitation.getInvitationVersion(), event.getScheduleVersion()) || Integer.valueOf(1).equals(invitation.getDeleted())) {
                invitation.setAcceptanceStatus("NONE"); invitation.setResponseTime(null); invitation.setInvitationVersion(event.getScheduleVersion());
                invitation.setDeleted(0); OaRecordSupport.touch(invitation); OaRecordSupport.saved(meetings.saveInvitation(invitation));
            }
        }
        for (OaMeetingAttendance removed : previous.values()) {
            if (Integer.valueOf(1).equals(removed.getDeleted())) continue;
            removed.setDeleted(1); OaRecordSupport.touch(removed); OaRecordSupport.saved(meetings.saveInvitation(removed));
        }
    }

    @Audit(name = "回应本人会议邀请")
    public OaMeetingAttendance respond(SysScheduleEvent event, MeetingCommands.Response command) {
        OaMeetingAccess.transaction();
        OaMeetingRules.require(command != null && command.acceptanceStatus() != null && Set.of("ACCEPTED", "DECLINED", "TENTATIVE").contains(command.acceptanceStatus()),
                "MEETING_RESPONSE_INVALID", "仅可接受、拒绝或暂定本人邀请");
        if (!"PLANNED".equals(event.getStatus()) || "DRAFT".equals(event.getApprovalStatus()) || "SERIES".equals(event.getRecurrenceRole())) throw new ServiceException("MEETING_INVITATION_CLOSED: 该会议不能回应邀请", 409);
        OaMeetingAttendance invitation = meetings.attendees(event.getTenantId(), event.getEventId()).stream()
                .filter(row -> Objects.equals(row.getUserId(), OaMeetingAccess.userId()) && Integer.valueOf(0).equals(row.getDeleted()))
                .findFirst().orElseThrow(() -> new ServiceException("MEETING_INVITATION_REQUIRED: 仅受邀本人可以回应", 403));
        if (!Objects.equals(command.invitationVersion(), event.getScheduleVersion()) || !Objects.equals(command.invitationVersion(), invitation.getInvitationVersion())) {
            throw new ServiceException("MEETING_INVITATION_EXPIRED: 邀请已更新，请重新查看", 409);
        }
        invitation.setAcceptanceStatus(command.acceptanceStatus()); invitation.setResponseTime(LocalDateTime.now()); OaRecordSupport.touch(invitation);
        OaRecordSupport.saved(meetings.saveInvitation(invitation));
        return invitation;
    }

    public List<Long> userIds(String encoded) {
        if (encoded == null || encoded.isBlank()) return List.of();
        try {
            JsonNode values = json.readTree(encoded);
            OaMeetingRules.require(values != null && values.isArray(), "MEETING_ATTENDEES_INVALID", "参会人须为标识数组");
            java.util.LinkedHashSet<Long> result = new java.util.LinkedHashSet<>();
            for (JsonNode value : values) {
                OaMeetingRules.require((value.isIntegralNumber() && value.canConvertToLong() || value.isTextual() && value.textValue().matches("[1-9][0-9]{0,18}")),
                        "MEETING_ATTENDEES_INVALID", "参会人标识无效");
                long userId = Long.parseLong(value.asText());
                OaMeetingRules.require(userId > 0 && result.add(userId), "MEETING_ATTENDEES_INVALID", "参会人标识须互异且大于0");
            }
            return List.copyOf(result);
        } catch (ServiceException failure) { throw failure; }
        catch (Exception failure) { throw OaMeetingRules.error("MEETING_ATTENDEES_INVALID", "参会人数组格式无效"); }
    }
}
