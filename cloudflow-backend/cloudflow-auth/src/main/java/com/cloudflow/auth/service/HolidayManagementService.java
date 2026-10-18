package com.cloudflow.auth.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.auth.domain.dto.HolidayCalendarDTO;
import com.cloudflow.auth.domain.dto.HolidayDateBatchDTO;
import com.cloudflow.auth.domain.dto.HolidayDateItemDTO;
import com.cloudflow.auth.domain.vo.DayTypeVO;
import com.cloudflow.auth.domain.vo.SysHolidayDateVO;
import com.cloudflow.auth.mapper.HolidayDateWriteMapper;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.audit.annotation.HighRiskAction;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.holiday.api.HolidayCalendarService;
import com.cloudflow.common.holiday.domain.DayTypeInfo;
import com.cloudflow.common.holiday.domain.HolidayCalendar;
import com.cloudflow.common.holiday.domain.HolidayDate;
import com.cloudflow.common.holiday.mapper.HolidayCalendarMapper;
import com.cloudflow.common.holiday.mapper.HolidayDateMapper;
import com.cloudflow.common.holiday.mapper.HolidayResolverMapper;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * 日历管理面服务。
 */
@Service
public class HolidayManagementService {
    private final HolidayCalendarMapper calendarMapper;
    private final HolidayDateMapper dateMapper;
    private final HolidayCalendarService calendarService;
    private final HolidayResolverMapper resolverMapper;
    private final HolidayDateWriteMapper dateWriteMapper;

    public HolidayManagementService(HolidayCalendarMapper calendarMapper, HolidayDateMapper dateMapper,
                                    HolidayCalendarService calendarService, HolidayResolverMapper resolverMapper,
                                    HolidayDateWriteMapper dateWriteMapper) {
        this.calendarMapper = calendarMapper;
        this.dateMapper = dateMapper;
        this.calendarService = calendarService;
        this.resolverMapper = resolverMapper;
        this.dateWriteMapper = dateWriteMapper;
    }

    public PageResult<HolidayCalendar> list(int pageNum, int pageSize) {
        List<HolidayCalendar> rows = calendarMapper.selectList(new LambdaQueryWrapper<HolidayCalendar>()
                .eq(HolidayCalendar::getTenantId, tenantId()).eq(HolidayCalendar::getDeleted, 0)
                .orderByDesc(HolidayCalendar::getDefaultFlag).orderByAsc(HolidayCalendar::getCalendarId));
        int p = Math.max(1, pageNum), s = Math.max(1, Math.min(200, pageSize));
        int from = Math.min((p - 1) * s, rows.size()), to = Math.min(from + s, rows.size());
        return new PageResult<>(rows.subList(from, to), rows.size(), p, s);
    }

    public HolidayCalendar get(Long id) {
        HolidayCalendar row = calendarMapper.selectOne(new LambdaQueryWrapper<HolidayCalendar>()
                .eq(HolidayCalendar::getCalendarId, id).eq(HolidayCalendar::getTenantId, tenantId())
                .eq(HolidayCalendar::getDeleted, 0));
        if (row == null) throw new ServiceException("节假日日历不存在", 404);
        return row;
    }

    @Transactional(rollbackFor = Exception.class)
    public void add(HolidayCalendarDTO dto) {
        validate(dto);
        lockTenant();
        HolidayCalendar row = new HolidayCalendar(); BeanUtils.copyProperties(dto, row);
        row.setTenantId(tenantId()); row.setDeleted(0); row.setVersion(0);
        row.setStatus(StringUtils.hasText(row.getStatus()) ? row.getStatus() : "ENABLED");
        if (Integer.valueOf(1).equals(row.getDefaultFlag())) clearDefault();
        calendarMapper.insert(row);
        if (Integer.valueOf(1).equals(row.getDefaultFlag())) invalidate(row.getCalendarId());
    }

    @Transactional(rollbackFor = Exception.class)
    public void edit(HolidayCalendarDTO dto) {
        if (dto == null || dto.getCalendarId() == null) throw new ServiceException("日历ID不能为空");
        validate(dto);
        lockTenant();
        HolidayCalendar row = get(dto.getCalendarId());
        BeanUtils.copyProperties(dto, row, "tenantId", "deleted", "version"); row.setTenantId(tenantId());
        if (Integer.valueOf(1).equals(row.getDefaultFlag())) clearDefault(row.getCalendarId());
        updateCalendar(row);
        invalidate(row.getCalendarId());
    }

    @Transactional(rollbackFor = Exception.class)
    @HighRiskAction
    @Audit(name = "删除节假日日历", highRisk = true)
    public void remove(List<Long> ids) {
        if (ids == null) return;
        for (Long id : ids) {
            HolidayCalendar row = get(id);
            long refs = dateMapper.selectCount(new LambdaQueryWrapper<HolidayDate>()
                    .eq(HolidayDate::getTenantId, tenantId())
                    .eq(HolidayDate::getCalendarId, id)
                    .eq(HolidayDate::getDeleted, 0));
            if (refs > 0) throw new ServiceException("日历已存在日期明细，不能删除");
            long deptRefs = resolverMapper.countDeptCalendarReferences(id, tenantId());
            long shiftRefs = resolverMapper.hasShiftCalendarColumn()
                    ? resolverMapper.countShiftCalendarReferences(id, tenantId()) : 0;
            long slaRefs = resolverMapper.hasCrmSlaCalendarColumn()
                    ? resolverMapper.countCrmSlaCalendarReferences(id, tenantId()) : 0;
            if (deptRefs + shiftRefs + slaRefs > 0) {
                List<String> references = new ArrayList<>();
                if (deptRefs > 0) references.add("部门");
                if (shiftRefs > 0) references.add("班次");
                if (slaRefs > 0) references.add("SLA策略");
                throw new ServiceException("日历已被" + String.join("、", references) + "引用，不能删除");
            }
            int removed = calendarMapper.delete(new LambdaQueryWrapper<HolidayCalendar>()
                    .eq(HolidayCalendar::getCalendarId, id)
                    .eq(HolidayCalendar::getTenantId, tenantId())
                    .eq(HolidayCalendar::getVersion, row.getVersion()));
            if (removed != 1) throw new ServiceException("日历已被其他操作修改，请刷新后重试", 409);
            invalidate(id);
        }
    }

    public List<SysHolidayDateVO> dates(Long calendarId, Integer yearNo) {
        if (yearNo == null) throw new ServiceException("年份不能为空");
        get(calendarId);
        return dateMapper.selectList(new LambdaQueryWrapper<HolidayDate>().eq(HolidayDate::getCalendarId, calendarId)
                .eq(HolidayDate::getTenantId, tenantId()).eq(HolidayDate::getYearNo, yearNo).eq(HolidayDate::getDeleted, 0)
                .orderByAsc(HolidayDate::getHolidayDate)).stream().map(row -> { SysHolidayDateVO vo = new SysHolidayDateVO(); BeanUtils.copyProperties(row, vo); return vo; }).toList();
    }

    @Transactional(rollbackFor = Exception.class)
    public void batchSave(HolidayDateBatchDTO dto) {
        if (dto == null || dto.getCalendarId() == null || dto.getYearNo() == null) {
            throw new ServiceException("日历和年份不能为空");
        }
        get(dto.getCalendarId());
        if (dateWriteMapper.lockCalendar(dto.getCalendarId(), tenantId()) == null) {
            throw new ServiceException("节假日日历不存在", 404);
        }
        dateMapper.delete(new LambdaQueryWrapper<HolidayDate>()
                .eq(HolidayDate::getTenantId, tenantId())
                .eq(HolidayDate::getCalendarId, dto.getCalendarId())
                .eq(HolidayDate::getYearNo, dto.getYearNo()));
        java.util.Set<LocalDate> seenDates = new java.util.HashSet<>();
        for (HolidayDateItemDTO item : dto.getDates() == null ? List.<HolidayDateItemDTO>of() : dto.getDates()) {
            if (item == null || item.getHolidayDate() == null) continue;
            if (item.getHolidayDate().getYear() != dto.getYearNo()) {
                throw new ServiceException("日期年份与日历年份不一致");
            }
            if (!seenDates.add(item.getHolidayDate())) {
                throw new ServiceException("同一日期不能重复配置");
            }
            String type = StringUtils.hasText(item.getDateType())
                    ? item.getDateType().trim().toUpperCase(Locale.ROOT) : "HOLIDAY";
            if (!List.of("WORKDAY", "HOLIDAY", "REST").contains(type)) {
                throw new ServiceException("日期类型不合法");
            }
            HolidayDate row = new HolidayDate(); BeanUtils.copyProperties(item, row);
            row.setTenantId(tenantId()); row.setCalendarId(dto.getCalendarId()); row.setYearNo(dto.getYearNo());
            row.setDateType(type);
            row.setTriplePayFlag(resolveTriplePayFlag(type, item.getTriplePayFlag())); row.setDeleted(0); row.setVersion(0);
            row.setCreateBy(userName()); row.setUpdateBy(userName());
            row.setCreateTime(LocalDateTime.now()); row.setUpdateTime(LocalDateTime.now());
            dateWriteMapper.saveDate(row);
        }
        invalidate(dto.getCalendarId(), dto.getYearNo());
    }

    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "新增导入节假日日期")
    public void createImportedDate(Long calendarId, HolidayDateItemDTO item) {
        HolidayCalendar calendar = get(calendarId);
        if (!"ENABLED".equals(calendar.getStatus())) throw new ServiceException("节假日日历已停用");
        if (item == null || item.getHolidayDate() == null) throw new ServiceException("日期不能为空");
        if (!List.of("WORKDAY", "HOLIDAY", "REST").contains(item.getDateType())) throw new ServiceException("日期类型不合法");
        HolidayDate row = new HolidayDate();
        BeanUtils.copyProperties(item, row);
        row.setTenantId(tenantId());
        row.setCalendarId(calendarId);
        row.setYearNo(item.getHolidayDate().getYear());
        row.setTriplePayFlag(resolveTriplePayFlag(item.getDateType(), item.getTriplePayFlag()));
        row.setDeleted(0);
        row.setVersion(0);
        row.setCreateBy(userName());
        row.setUpdateBy(userName());
        row.setCreateTime(LocalDateTime.now());
        row.setUpdateTime(LocalDateTime.now());
        dateMapper.insert(row);
        invalidate(calendarId, row.getYearNo());
    }

    private int resolveTriplePayFlag(String dateType, Integer triplePayFlag) {
        if (triplePayFlag == null) return "HOLIDAY".equals(dateType) ? 1 : 0;
        if (triplePayFlag != 0 && triplePayFlag != 1) throw new ServiceException("三倍工资日标记只能为0或1");
        return triplePayFlag;
    }

    @Transactional(rollbackFor = Exception.class)
    @HighRiskAction
    @Audit(name = "删除节假日日期明细", highRisk = true)
    public void removeDates(List<Long> ids) {
        if (ids == null || ids.isEmpty()) return;
        List<HolidayDate> existing = dateMapper.selectList(new LambdaQueryWrapper<HolidayDate>()
                .in(HolidayDate::getDateId, ids).eq(HolidayDate::getTenantId, tenantId()));
        dateMapper.delete(new LambdaQueryWrapper<HolidayDate>().in(HolidayDate::getDateId, ids)
                .eq(HolidayDate::getTenantId, tenantId()));
        Set<String> invalidated = new HashSet<>();
        for (HolidayDate row : existing) {
            if (row.getCalendarId() == null || row.getYearNo() == null) continue;
            String key = row.getCalendarId() + ":" + row.getYearNo();
            if (invalidated.add(key)) invalidate(row.getCalendarId(), row.getYearNo());
        }
    }


    public List<DayTypeVO> month(Long calendarId, int year, int month) {
        List<DayTypeVO> result = new ArrayList<>(); YearMonth ym = YearMonth.of(year, month);
        for (LocalDate date = ym.atDay(1); !date.isAfter(ym.atEndOfMonth()); date = date.plusDays(1)) result.add(toVO(calendarService.getDateType(calendarId, date)));
        return result;
    }

    public DayTypeVO dateType(Long calendarId, LocalDate date) { return toVO(calendarService.getDateType(calendarId, date)); }
    public boolean isWorkday(Long calendarId, LocalDate date) { return calendarService.isWorkday(calendarId, date); }
    public int countWorkdays(Long calendarId, LocalDate start, LocalDate end) { return calendarService.countWorkdays(calendarId, start, end); }
    public LocalDate nextWorkday(Long calendarId, LocalDate date, int n) { return calendarService.nextWorkday(calendarId, date, n); }
    public Long resolveCalendar(Long employeeId, LocalDate date) { return calendarService.resolveCalendarId(employeeId, date); }

    private DayTypeVO toVO(DayTypeInfo info) { return new DayTypeVO(info.getDate(), info.getDateType(), info.getHolidayName(), info.getTriplePayFlag()); }
    private Long tenantId() { return UserContext.getTenantId() == null ? 100000L : UserContext.getTenantId(); }
    private String userName() { return StringUtils.hasText(UserContext.getUserName()) ? UserContext.getUserName() : "system"; }
    private void invalidate(Long id) {
        invalidate(id, null);
    }

    private void invalidate(Long id, Integer year) {
        if (!(calendarService instanceof com.cloudflow.common.holiday.service.HolidayCalendarServiceImpl impl)) {
            return;
        }
        impl.evictCalendar(id, year);
    }

    private void clearDefault() {
        clearDefault(null);
    }

    private void clearDefault(Long exceptId) {
        List<HolidayCalendar> rows = dateWriteMapper.lockDefaultCalendars(tenantId(), exceptId);
        for (HolidayCalendar row : rows) {
            row.setDefaultFlag(0);
            updateCalendar(row);
            invalidate(row.getCalendarId());
        }
    }

    private void validate(HolidayCalendarDTO dto) {
        if (dto == null || !StringUtils.hasText(dto.getCalendarCode()) || !StringUtils.hasText(dto.getCalendarName())) {
            throw new ServiceException("日历编码和名称不能为空");
        }
    }

    private void lockTenant() {
        if (dateWriteMapper.lockTenant(tenantId()) == null) throw new ServiceException("租户不存在或已删除", 404);
    }

    private void updateCalendar(HolidayCalendar row) {
        if (calendarMapper.updateById(row) != 1) throw new ServiceException("日历已被其他操作修改，请刷新后重试");
    }
}
