package com.cloudflow.oa.service;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.service.IService;
import com.cloudflow.oa.domain.DutySchedule;

import java.util.List;

/**
 * 值班排班 Service 接口
 */
public interface IDutyScheduleService extends IService<DutySchedule> {

    /** 分页查询 */
    IPage<DutySchedule> queryPage(DutySchedule query, int pageNum, int pageSize);

    /** 按月查询值班列表（日历视图用） */
    List<DutySchedule> listByMonth(int year, int month, Long deptId);

    /** 值班签到 */
    boolean checkIn(Long scheduleId);

    /** 值班签退 */
    boolean checkOut(Long scheduleId);

    /** 换班申请 */
    boolean swapDuty(Long scheduleId, Long backupUserId, String backupUserName, String reason);
}
