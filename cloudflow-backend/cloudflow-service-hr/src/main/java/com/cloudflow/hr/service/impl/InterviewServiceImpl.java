package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.utils.SecurityUtils;
import com.cloudflow.hr.client.AuthServiceClient;
import com.cloudflow.hr.client.OaScheduleClient;
import com.cloudflow.hr.client.dto.MeetingRoomBookingCreateDTO;
import com.cloudflow.hr.client.vo.MeetingRoomBookingVO;
import com.cloudflow.hr.client.vo.UserVO;
import com.cloudflow.hr.domain.dto.InterviewEvaluationDTO;
import com.cloudflow.hr.domain.dto.InterviewQueryDTO;
import com.cloudflow.hr.domain.dto.InterviewScheduleDTO;
import com.cloudflow.hr.domain.dto.InterviewUpdateDTO;
import com.cloudflow.hr.domain.entity.Candidate;
import com.cloudflow.hr.domain.entity.Interview;
import com.cloudflow.hr.domain.entity.Position;
import com.cloudflow.hr.domain.entity.RecruitmentRequest;
import com.cloudflow.hr.domain.vo.InterviewVO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.CandidateMapper;
import com.cloudflow.hr.mapper.InterviewMapper;
import com.cloudflow.hr.mapper.PositionMapper;
import com.cloudflow.hr.mapper.RecruitmentRequestMapper;
import com.cloudflow.hr.service.InterviewService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

/**
 * 面试服务实现类
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class InterviewServiceImpl implements InterviewService {

    private final InterviewMapper interviewMapper;
    private final CandidateMapper candidateMapper;
    private final RecruitmentRequestMapper recruitmentRequestMapper;
    private final PositionMapper positionMapper;
    private final AuthServiceClient authServiceClient;
    private final OaScheduleClient oaScheduleClient;
    private final ObjectMapper objectMapper;

    // 面试轮次映射
    private static final Map<String, String> INTERVIEW_ROUND_MAP = new HashMap<>();
    // 面试类型映射
    private static final Map<String, String> INTERVIEW_TYPE_MAP = new HashMap<>();
    // 面试结果映射
    private static final Map<String, String> INTERVIEW_RESULT_MAP = new HashMap<>();
    // 面试状态映射
    private static final Map<String, String> INTERVIEW_STATUS_MAP = new HashMap<>();
    // 只有这些候选人状态允许继续安排面试
    private static final List<String> INTERVIEWABLE_CANDIDATE_STATUSES = List.of("NEW", "SCREENING", "INTERVIEW");

    static {
        INTERVIEW_ROUND_MAP.put("FIRST", "初试");
        INTERVIEW_ROUND_MAP.put("SECOND", "复试");
        INTERVIEW_ROUND_MAP.put("FINAL", "终试");

        INTERVIEW_TYPE_MAP.put("PHONE", "电话面试");
        INTERVIEW_TYPE_MAP.put("VIDEO", "视频面试");
        INTERVIEW_TYPE_MAP.put("ONSITE", "现场面试");

        INTERVIEW_RESULT_MAP.put("PASS", "通过");
        INTERVIEW_RESULT_MAP.put("FAIL", "不通过");
        INTERVIEW_RESULT_MAP.put("PENDING", "待定");

        INTERVIEW_STATUS_MAP.put("SCHEDULED", "已安排");
        INTERVIEW_STATUS_MAP.put("COMPLETED", "已完成");
        INTERVIEW_STATUS_MAP.put("CANCELLED", "已取消");
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long scheduleInterview(InterviewScheduleDTO dto) {
        log.info("安排面试，候选人ID: {}, 面试轮次: {}", dto.getCandidateId(), dto.getInterviewRound());

        // 验证候选人是否存在
        Long tenantId = SecurityUtils.getTenantId();
        Candidate candidate = getCandidateOrThrow(dto.getCandidateId(), tenantId);
        RecruitmentRequest request = getRecruitmentRequestOrThrow(candidate.getRequestId(), tenantId);

        if (!"RECRUITING".equals(request.getStatus())) {
            throw new HrBusinessException("INVALID_REQUEST_STATUS", "只有招聘中的需求才能安排面试");
        }
        if (!INTERVIEWABLE_CANDIDATE_STATUSES.contains(candidate.getStatus())) {
            throw new HrBusinessException("INVALID_CANDIDATE_STATUS", "当前候选人状态不能安排面试");
        }
        validateInterviewTime(dto.getInterviewTime(), dto.getInterviewEndTime());

        // 创建面试记录
        Interview interview = new Interview();
        interview.setTenantId(tenantId);
        interview.setCandidateId(dto.getCandidateId());
        interview.setInterviewRound(dto.getInterviewRound());
        interview.setInterviewType(dto.getInterviewType());
        interview.setInterviewTime(dto.getInterviewTime());
        interview.setInterviewEndTime(dto.getInterviewEndTime());
        interview.setLocation(dto.getLocation());
        interview.setStatus("SCHEDULED");

        // 转换面试官ID列表为JSON
        if (dto.getInterviewerIds() != null && !dto.getInterviewerIds().isEmpty()) {
            try {
                interview.setInterviewers(objectMapper.writeValueAsString(dto.getInterviewerIds()));
            } catch (JsonProcessingException e) {
                log.error("转换面试官ID列表失败", e);
                throw new RuntimeException("转换面试官ID列表失败");
            }
        }

        if (dto.getMeetingRoomId() != null) {
            MeetingRoomBookingVO booking = createMeetingRoomBooking(dto, candidate, request, interview.getInterviewers());
            interview.setMeetingRoomId(booking.getRoomId());
            interview.setMeetingRoomName(booking.getRoomName());
            interview.setScheduleEventId(booking.getEventId());
            interview.setLocation(booking.getLocationSnapshot());
        }

        interviewMapper.insert(interview);

        // 更新候选人状态为面试中
        if (!"INTERVIEW".equals(candidate.getStatus())) {
            candidate.setStatus("INTERVIEW");
            candidateMapper.updateById(candidate);
        }

        log.info("面试安排成功，面试ID: {}", interview.getId());
        return interview.getId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void updateInterview(Long id, InterviewUpdateDTO dto) {
        log.info("更新面试，面试ID: {}", id);

        // 查询面试记录
        Long tenantId = SecurityUtils.getTenantId();
        Interview interview = getInterviewOrThrow(id, tenantId);

        // 只有已安排状态的面试才能更新
        if (!"SCHEDULED".equals(interview.getStatus())) {
            throw new RuntimeException("只有已安排状态的面试才能更新");
        }

        // 更新面试信息
        if (StringUtils.hasText(dto.getInterviewRound())) {
            interview.setInterviewRound(dto.getInterviewRound());
        }
        if (StringUtils.hasText(dto.getInterviewType())) {
            interview.setInterviewType(dto.getInterviewType());
        }
        if (dto.getInterviewTime() != null) {
            interview.setInterviewTime(dto.getInterviewTime());
        }
        if (dto.getInterviewEndTime() != null) {
            interview.setInterviewEndTime(dto.getInterviewEndTime());
        }
        validateInterviewTime(interview.getInterviewTime(), interview.getInterviewEndTime());
        if (dto.getLocation() != null) {
            interview.setLocation(dto.getLocation());
        }

        // 更新面试官ID列表
        if (dto.getInterviewerIds() != null) {
            try {
                interview.setInterviewers(objectMapper.writeValueAsString(dto.getInterviewerIds()));
            } catch (JsonProcessingException e) {
                log.error("转换面试官ID列表失败", e);
                throw new RuntimeException("转换面试官ID列表失败");
            }
        }

        interviewMapper.updateById(interview);
        log.info("面试更新成功，面试ID: {}", id);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void completeInterview(Long id, InterviewEvaluationDTO dto) {
        log.info("完成面试评价，面试ID: {}", id);

        // 查询面试记录
        Long tenantId = SecurityUtils.getTenantId();
        Interview interview = getInterviewOrThrow(id, tenantId);

        // 只有已安排状态的面试才能完成评价
        if (!"SCHEDULED".equals(interview.getStatus())) {
            throw new RuntimeException("只有已安排状态的面试才能完成评价");
        }

        // 更新面试评价信息
        interview.setEvaluation(dto.getEvaluation());
        interview.setScore(dto.getScore());
        interview.setResult(dto.getResult());
        interview.setStatus("COMPLETED");

        interviewMapper.updateById(interview);
        log.info("面试评价完成，面试ID: {}, 结果: {}", id, dto.getResult());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void cancelInterview(Long id) {
        log.info("取消面试，面试ID: {}", id);

        // 查询面试记录
        Long tenantId = SecurityUtils.getTenantId();
        Interview interview = getInterviewOrThrow(id, tenantId);

        // 只有已安排状态的面试才能取消
        if (!"SCHEDULED".equals(interview.getStatus())) {
            throw new RuntimeException("只有已安排状态的面试才能取消");
        }

        // 更新面试状态为已取消
        interview.setStatus("CANCELLED");
        interviewMapper.updateById(interview);

        log.info("面试取消成功，面试ID: {}", id);
    }

    @Override
    public InterviewVO getInterview(Long id) {
        log.info("查询面试详情，面试ID: {}", id);

        Long tenantId = SecurityUtils.getTenantId();
        Interview interview = getInterviewOrThrow(id, tenantId);

        return convertToVO(interview, tenantId);
    }

    @Override
    public List<InterviewVO> listInterviews(InterviewQueryDTO query) {
        log.info("查询面试列表，查询条件: {}", query);
        Long tenantId = SecurityUtils.getTenantId();

        // 构建查询条件
        LambdaQueryWrapper<Interview> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(Interview::getTenantId, tenantId)
                .eq(query.getCandidateId() != null, Interview::getCandidateId, query.getCandidateId())
                .eq(StringUtils.hasText(query.getInterviewRound()), Interview::getInterviewRound, query.getInterviewRound())
                .eq(StringUtils.hasText(query.getInterviewType()), Interview::getInterviewType, query.getInterviewType())
                .ge(query.getInterviewTimeStart() != null, Interview::getInterviewTime, query.getInterviewTimeStart())
                .le(query.getInterviewTimeEnd() != null, Interview::getInterviewTime, query.getInterviewTimeEnd())
                .eq(StringUtils.hasText(query.getResult()), Interview::getResult, query.getResult())
                .eq(StringUtils.hasText(query.getStatus()), Interview::getStatus, query.getStatus())
                .orderByDesc(Interview::getCreateTime);

        List<Interview> interviews = interviewMapper.selectList(wrapper);
        return interviews.stream()
                .map(interview -> convertToVO(interview, tenantId))
                .collect(Collectors.toList());
    }

    private Candidate getCandidateOrThrow(Long candidateId, Long tenantId) {
        Candidate candidate = candidateMapper.selectById(candidateId);
        if (candidate == null || !tenantId.equals(candidate.getTenantId())) {
            throw new HrBusinessException("候选人不存在");
        }
        return candidate;
    }

    private RecruitmentRequest getRecruitmentRequestOrThrow(Long requestId, Long tenantId) {
        RecruitmentRequest request = recruitmentRequestMapper.selectById(requestId);
        if (request == null || !tenantId.equals(request.getTenantId())) {
            throw new HrBusinessException("招聘需求不存在");
        }
        return request;
    }

    private Interview getInterviewOrThrow(Long interviewId, Long tenantId) {
        Interview interview = interviewMapper.selectById(interviewId);
        if (interview == null || !tenantId.equals(interview.getTenantId())) {
            throw new HrBusinessException("面试记录不存在");
        }
        return interview;
    }

    /**
     * 转换为VO对象
     */
    private InterviewVO convertToVO(Interview interview, Long tenantId) {
        InterviewVO vo = new InterviewVO();
        BeanUtils.copyProperties(interview, vo);

        // 设置候选人姓名
        Candidate candidate = candidateMapper.selectById(interview.getCandidateId());
        if (candidate != null && tenantId.equals(candidate.getTenantId())) {
            vo.setCandidateName(candidate.getName());
        }

        // 解析面试官ID列表
        if (StringUtils.hasText(interview.getInterviewers())) {
            try {
                List<Long> interviewerIds = objectMapper.readValue(
                        interview.getInterviewers(),
                        new TypeReference<List<Long>>() {}
                );
                vo.setInterviewerIds(interviewerIds);
                // TODO: 调用Auth服务获取面试官姓名列表
                // 这里暂时使用ID作为姓名
                vo.setInterviewerNames(resolveInterviewerNames(interviewerIds));
            } catch (JsonProcessingException e) {
                log.error("解析面试官ID列表失败", e);
                vo.setInterviewerIds(new ArrayList<>());
                vo.setInterviewerNames(new ArrayList<>());
            }
        } else {
            vo.setInterviewerIds(new ArrayList<>());
            vo.setInterviewerNames(new ArrayList<>());
        }

        // 设置名称
        vo.setInterviewRoundName(INTERVIEW_ROUND_MAP.get(interview.getInterviewRound()));
        vo.setInterviewTypeName(INTERVIEW_TYPE_MAP.get(interview.getInterviewType()));
        vo.setResultName(INTERVIEW_RESULT_MAP.get(interview.getResult()));
        vo.setStatusName(INTERVIEW_STATUS_MAP.get(interview.getStatus()));

        return vo;
    }

    private List<String> resolveInterviewerNames(List<Long> interviewerIds) {
        if (interviewerIds == null || interviewerIds.isEmpty()) {
            return new ArrayList<>();
        }
        try {
            R<List<UserVO>> result = authServiceClient.batchGetUsers(interviewerIds);
            if (result != null && result.isSuccess() && result.getData() != null) {
                Map<Long, String> userNameMap = result.getData().stream()
                        .filter(Objects::nonNull)
                        .filter(user -> user.getUserId() != null)
                        .collect(Collectors.toMap(
                                UserVO::getUserId,
                                user -> StringUtils.hasText(user.getNickName()) ? user.getNickName() : user.getUserName(),
                                (left, right) -> left
                        ));
                return interviewerIds.stream()
                        .map(id -> userNameMap.getOrDefault(id, String.valueOf(id)))
                        .collect(Collectors.toList());
            }
        } catch (Exception e) {
            log.warn("查询面试官姓名失败，interviewerIds={}", interviewerIds, e);
        }
        return interviewerIds.stream()
                .map(String::valueOf)
                .collect(Collectors.toList());
    }

    private void validateInterviewTime(java.time.LocalDateTime startTime, java.time.LocalDateTime endTime) {
        if (startTime == null) {
            throw new HrBusinessException("INVALID_INTERVIEW_TIME", "面试时间不能为空");
        }
        if (endTime == null) {
            throw new HrBusinessException("INVALID_INTERVIEW_TIME", "面试结束时间不能为空");
        }
        if (!endTime.isAfter(startTime)) {
            throw new HrBusinessException("INVALID_INTERVIEW_TIME", "面试结束时间必须晚于开始时间");
        }
    }

    private MeetingRoomBookingVO createMeetingRoomBooking(InterviewScheduleDTO dto,
                                                          Candidate candidate,
                                                          RecruitmentRequest request,
                                                          String attendees) {
        MeetingRoomBookingCreateDTO bookingDTO = new MeetingRoomBookingCreateDTO();
        bookingDTO.setRoomId(dto.getMeetingRoomId());
        bookingDTO.setTitle("面试：" + candidate.getName());
        bookingDTO.setDescription(buildBookingDescription(request, dto));
        bookingDTO.setStartTime(dto.getInterviewTime());
        bookingDTO.setEndTime(dto.getInterviewEndTime());
        bookingDTO.setCreatorId(SecurityUtils.getUserId());
        bookingDTO.setAttendees(attendees);

        R<MeetingRoomBookingVO> result;
        try {
            result = oaScheduleClient.createMeetingRoomBooking(bookingDTO);
        } catch (Exception e) {
            log.error("预订面试会议室失败，candidateId={}, meetingRoomId={}", dto.getCandidateId(), dto.getMeetingRoomId(), e);
            throw new HrBusinessException("MEETING_ROOM_BOOKING_FAILED", "OA会议室预订失败，请稍后重试");
        }

        if (result == null) {
            throw new HrBusinessException("MEETING_ROOM_BOOKING_FAILED", "OA服务无响应，无法预订会议室");
        }
        if (!result.isSuccess()) {
            throw new HrBusinessException("MEETING_ROOM_BOOKING_FAILED", result.getMsg());
        }
        MeetingRoomBookingVO booking = result.getData();
        if (booking == null || booking.getEventId() == null || booking.getRoomId() == null) {
            throw new HrBusinessException("MEETING_ROOM_BOOKING_FAILED", "OA服务未返回会议室预订结果");
        }
        return booking;
    }

    private String buildBookingDescription(RecruitmentRequest request, InterviewScheduleDTO dto) {
        String positionName = resolvePositionName(request.getPositionId());
        return "招聘需求编号：" + request.getRequestNo()
                + "\n岗位：" + positionName
                + "\n面试轮次：" + INTERVIEW_ROUND_MAP.getOrDefault(dto.getInterviewRound(), dto.getInterviewRound())
                + "\n面试形式：" + INTERVIEW_TYPE_MAP.getOrDefault(dto.getInterviewType(), dto.getInterviewType());
    }

    private String resolvePositionName(Long positionId) {
        if (positionId == null) {
            return "";
        }
        Position position = positionMapper.selectById(positionId);
        if (position == null || !StringUtils.hasText(position.getPositionName())) {
            return String.valueOf(positionId);
        }
        return position.getPositionName();
    }
}
