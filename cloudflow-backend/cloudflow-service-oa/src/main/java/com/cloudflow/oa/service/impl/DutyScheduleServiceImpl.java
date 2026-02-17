package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.datascope.DataScopeHelper;
import com.cloudflow.oa.domain.DutySchedule;
import com.cloudflow.oa.mapper.DutyScheduleMapper;
import com.cloudflow.oa.service.IDutyScheduleService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.util.Date;
import java.util.List;

/**
 * 值班排班 Service 实现类
 */
@Slf4j
@Service
public class DutyScheduleServiceImpl extends ServiceImpl<DutyScheduleMapper, DutySchedule>
        implements IDutyScheduleService {

    @Override
    public IPage<DutySchedule> queryPage(DutySchedule query, int pageNum, int pageSize) {
        LambdaQueryWrapper<DutySchedule> wrapper = new LambdaQueryWrapper<>();
        if (query.getUserId() != null) {
            wrapper.eq(DutySchedule::getUserId, query.getUserId());
        }
        if (query.getDeptId() != null) {
            wrapper.eq(DutySchedule::getDeptId, query.getDeptId());
        }
        if (StringUtils.hasText(query.getScheduleType())) {
            wrapper.eq(DutySchedule::getScheduleType, query.getScheduleType());
        }
        if (StringUtils.hasText(query.getStatus())) {
            wrapper.eq(DutySchedule::getStatus, query.getStatus());
        }
        if (query.getDutyDate() != null) {
            wrapper.eq(DutySchedule::getDutyDate, query.getDutyDate());
        }
        wrapper.and(w -> w.isNull(DutySchedule::getDelFlag).or().ne(DutySchedule::getDelFlag, "2"));

        // 数据权限过滤：根据当前用户的权限类型，自动追加部门/用户过滤条件
        DataScopeHelper.apply(wrapper, DutySchedule::getUserId, DutySchedule::getDeptId);

        wrapper.orderByDesc(DutySchedule::getDutyDate);
        return page(new Page<>(pageNum, pageSize), wrapper);
    }

    @Override
    public List<DutySchedule> listByMonth(int year, int month, Long deptId) {
        // 计算月份的起止日期
        LocalDate startDate = LocalDate.of(year, month, 1);
        LocalDate endDate = startDate.plusMonths(1).minusDays(1);

        LambdaQueryWrapper<DutySchedule> wrapper = new LambdaQueryWrapper<>();
        wrapper.ge(DutySchedule::getDutyDate, java.sql.Date.valueOf(startDate));
        wrapper.le(DutySchedule::getDutyDate, java.sql.Date.valueOf(endDate));
        if (deptId != null) {
            wrapper.eq(DutySchedule::getDeptId, deptId);
        }
        wrapper.and(w -> w.isNull(DutySchedule::getDelFlag).or().ne(DutySchedule::getDelFlag, "2"));
        wrapper.orderByAsc(DutySchedule::getDutyDate);
        return list(wrapper);
    }

    @Override
    @Audit(name = "值班签到", spel = "#scheduleId")
    @Transactional(rollbackFor = Exception.class)
    public boolean checkIn(Long scheduleId) {
        DutySchedule schedule = getById(scheduleId);
        if (schedule == null || !"SCHEDULED".equals(schedule.getStatus())) {
            return false;
        }
        schedule.setStatus("CHECKED_IN");
        schedule.setCheckInTime(new Date());
        return updateById(schedule);
    }

    @Override
    @Audit(name = "值班签退", spel = "#scheduleId")
    @Transactional(rollbackFor = Exception.class)
    public boolean checkOut(Long scheduleId) {
        DutySchedule schedule = getById(scheduleId);
        if (schedule == null || !"CHECKED_IN".equals(schedule.getStatus())) {
            return false;
        }
        schedule.setStatus("COMPLETED");
        schedule.setCheckOutTime(new Date());
        return updateById(schedule);
    }

    @Override
    @Audit(name = "换班申请", spel = "#scheduleId")
    @Transactional(rollbackFor = Exception.class)
    public boolean swapDuty(Long scheduleId, Long backupUserId, String backupUserName, String reason) {
        DutySchedule schedule = getById(scheduleId);
        if (schedule == null || !"SCHEDULED".equals(schedule.getStatus())) {
            log.warn("值班排班 {} 当前状态不允许换班", scheduleId);
            return false;
        }
        schedule.setBackupUserId(backupUserId);
        schedule.setBackupUserName(backupUserName);
        schedule.setSwapReason(reason);
        schedule.setStatus("SWAPPED");
        return updateById(schedule);
    }
}
