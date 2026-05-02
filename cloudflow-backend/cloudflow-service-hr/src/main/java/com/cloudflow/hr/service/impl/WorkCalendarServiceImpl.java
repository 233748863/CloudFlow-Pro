package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.utils.SecurityUtils;
import com.cloudflow.hr.domain.dto.WorkCalendarDTO;
import com.cloudflow.hr.domain.dto.WorkCalendarQueryDTO;
import com.cloudflow.hr.domain.entity.WorkCalendar;
import com.cloudflow.hr.domain.vo.WorkCalendarVO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.WorkCalendarMapper;
import com.cloudflow.hr.service.WorkCalendarService;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class WorkCalendarServiceImpl implements WorkCalendarService {

    private static final String DAY_WORKDAY = "WORKDAY";
    private static final String DAY_REST = "REST";
    private static final String DAY_HOLIDAY = "HOLIDAY";

    private final WorkCalendarMapper workCalendarMapper;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long createWorkCalendar(WorkCalendarDTO dto) {
        validateDayType(dto.getDayType());
        Long tenantId = SecurityUtils.getTenantId();
        WorkCalendar existing = findByDate(tenantId, dto.getCalendarDate());
        if (existing != null) {
            throw new HrBusinessException("该日期已存在企业日历配置");
        }

        WorkCalendar calendar = new WorkCalendar();
        BeanUtils.copyProperties(dto, calendar);
        calendar.setTenantId(tenantId);
        calendar.setSource(dto.getSource() == null || dto.getSource().isBlank() ? "MANUAL" : dto.getSource());
        calendar.setStatus(dto.getStatus() == null ? 1 : dto.getStatus());
        workCalendarMapper.insert(calendar);
        return calendar.getId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void updateWorkCalendar(Long id, WorkCalendarDTO dto) {
        validateDayType(dto.getDayType());
        Long tenantId = SecurityUtils.getTenantId();
        WorkCalendar existing = workCalendarMapper.selectById(id);
        if (existing == null || !tenantId.equals(existing.getTenantId())) {
            throw new HrBusinessException("企业日历配置不存在");
        }
        WorkCalendar dateExisting = findByDate(tenantId, dto.getCalendarDate());
        if (dateExisting != null && !dateExisting.getId().equals(id)) {
            throw new HrBusinessException("该日期已存在企业日历配置");
        }

        WorkCalendar calendar = new WorkCalendar();
        BeanUtils.copyProperties(dto, calendar);
        calendar.setId(id);
        calendar.setTenantId(tenantId);
        calendar.setSource(dto.getSource() == null || dto.getSource().isBlank() ? existing.getSource() : dto.getSource());
        calendar.setStatus(dto.getStatus() == null ? existing.getStatus() : dto.getStatus());
        workCalendarMapper.updateById(calendar);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deleteWorkCalendar(Long id) {
        Long tenantId = SecurityUtils.getTenantId();
        WorkCalendar existing = workCalendarMapper.selectById(id);
        if (existing == null || !tenantId.equals(existing.getTenantId())) {
            throw new HrBusinessException("企业日历配置不存在");
        }
        workCalendarMapper.deleteById(id);
    }

    @Override
    public List<WorkCalendarVO> listWorkCalendars(WorkCalendarQueryDTO query) {
        Long tenantId = SecurityUtils.getTenantId();
        LambdaQueryWrapper<WorkCalendar> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(WorkCalendar::getTenantId, tenantId)
                .ge(query.getStartDate() != null, WorkCalendar::getCalendarDate, query.getStartDate())
                .le(query.getEndDate() != null, WorkCalendar::getCalendarDate, query.getEndDate())
                .eq(query.getDayType() != null && !query.getDayType().isBlank(), WorkCalendar::getDayType, query.getDayType())
                .orderByAsc(WorkCalendar::getCalendarDate);
        return workCalendarMapper.selectList(wrapper).stream()
                .map(this::convertToVO)
                .toList();
    }

    private WorkCalendar findByDate(Long tenantId, java.time.LocalDate calendarDate) {
        LambdaQueryWrapper<WorkCalendar> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(WorkCalendar::getTenantId, tenantId)
                .eq(WorkCalendar::getCalendarDate, calendarDate)
                .last("LIMIT 1");
        return workCalendarMapper.selectOne(wrapper);
    }

    private void validateDayType(String dayType) {
        if (!DAY_WORKDAY.equals(dayType) && !DAY_REST.equals(dayType) && !DAY_HOLIDAY.equals(dayType)) {
            throw new HrBusinessException("不支持的日期类型：" + dayType);
        }
    }

    private WorkCalendarVO convertToVO(WorkCalendar calendar) {
        WorkCalendarVO vo = new WorkCalendarVO();
        BeanUtils.copyProperties(calendar, vo);
        vo.setDayTypeName(getDayTypeName(calendar.getDayType()));
        vo.setStatusDesc(calendar.getStatus() != null && calendar.getStatus() == 1 ? "启用" : "禁用");
        return vo;
    }

    private String getDayTypeName(String dayType) {
        return switch (dayType) {
            case DAY_WORKDAY -> "工作日";
            case DAY_REST -> "休息日";
            case DAY_HOLIDAY -> "节假日";
            default -> dayType;
        };
    }
}
