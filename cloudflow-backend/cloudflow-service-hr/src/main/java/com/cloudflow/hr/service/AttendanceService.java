package com.cloudflow.hr.service;

import com.cloudflow.hr.domain.dto.AttendanceCheckDTO;
import com.cloudflow.hr.domain.dto.AttendanceRecordQueryDTO;
import com.cloudflow.hr.domain.dto.AttendanceSupplementDTO;
import com.cloudflow.hr.domain.vo.AttendanceDailyVO;
import com.cloudflow.hr.domain.vo.AttendanceRecordVO;

import java.time.LocalDate;
import java.util.List;

/**
 * 考勤打卡服务接口
 *
 * @author CloudFlow
 * @date 2026-03-20
 */
public interface AttendanceService {

    /**
     * 上班打卡
     *
     * @param dto 打卡请求DTO
     */
    void checkIn(AttendanceCheckDTO dto);

    /**
     * 下班打卡
     *
     * @param dto 打卡请求DTO
     */
    void checkOut(AttendanceCheckDTO dto);

    /**
     * 创建补卡申请
     *
     * @param dto 补卡申请DTO
     * @return 申请ID
     */
    Long createSupplementApplication(AttendanceSupplementDTO dto);

    /**
     * 提交补卡申请
     *
     * @param id 申请ID
     */
    void submitSupplementApplication(Long id);

    /**
     * 审批通过补卡申请
     *
     * @param id 申请ID
     */
    void approveSupplementApplication(Long id);

    /**
     * 审批拒绝补卡申请
     *
     * @param id 申请ID
     */
    void rejectSupplementApplication(Long id);

    /**
     * 查询打卡记录列表
     *
     * @param query 查询条件
     * @return 打卡记录列表
     */
    List<AttendanceRecordVO> listAttendanceRecords(AttendanceRecordQueryDTO query);

    /**
     * 获取某天的打卡记录
     *
     * @param employeeId 员工ID
     * @param date 日期
     * @return 每日考勤VO
     */
    AttendanceDailyVO getDailyAttendance(Long employeeId, LocalDate date);
}
