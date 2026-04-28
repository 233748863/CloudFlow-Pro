package com.cloudflow.hr.service;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.cloudflow.hr.domain.dto.LeaveApplicationCreateDTO;
import com.cloudflow.hr.domain.dto.LeaveApplicationQueryDTO;
import com.cloudflow.hr.domain.dto.LeaveQuotaAdjustDTO;
import com.cloudflow.hr.domain.dto.LeaveTypeCreateDTO;
import com.cloudflow.hr.domain.dto.LeaveTypeUpdateDTO;
import com.cloudflow.hr.domain.vo.LeaveApplicationVO;
import com.cloudflow.hr.domain.vo.LeaveQuotaInitResultVO;
import com.cloudflow.hr.domain.vo.LeaveQuotaVO;
import com.cloudflow.hr.domain.vo.LeaveTypeVO;

import java.time.LocalDateTime;
import java.util.List;

public interface LeaveService {

    Long createLeaveType(LeaveTypeCreateDTO dto);

    void updateLeaveType(Long id, LeaveTypeUpdateDTO dto);

    LeaveTypeVO getLeaveType(Long id);

    List<LeaveTypeVO> listLeaveTypes();

    LeaveQuotaInitResultVO initLeaveQuota(Long employeeId, Integer year, Long leaveTypeId);

    void adjustLeaveQuota(LeaveQuotaAdjustDTO dto);

    LeaveQuotaVO getLeaveQuota(Long employeeId, Long leaveTypeId, Integer year);

    List<LeaveQuotaVO> listLeaveQuotaBuckets(Long employeeId, Long leaveTypeId, Integer year);

    List<LeaveQuotaVO> listLeaveQuotas(Long employeeId, Integer year);

    Long createLeaveApplication(LeaveApplicationCreateDTO dto);

    void submitLeaveApplication(Long id);

    void approveLeaveApplication(Long id);

    void rejectLeaveApplication(Long id);

    void cancelLeaveApplication(Long id);

    LeaveApplicationVO getLeaveApplication(Long id);

    IPage<LeaveApplicationVO> listLeaveApplications(LeaveApplicationQueryDTO query);

    List<LeaveApplicationVO> listApprovedLeaveBoard(LocalDateTime startTime, LocalDateTime endTime);
}
