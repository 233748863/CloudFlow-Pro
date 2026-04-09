package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.config.CloudFlowConfig;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.utils.SecurityUtils;
import com.cloudflow.common.excel.utils.ExcelUtil;
import com.cloudflow.hr.client.AuthServiceClient;
import com.cloudflow.hr.client.vo.DeptVO;
import com.cloudflow.hr.domain.dto.AttendanceAnomalyQueryDTO;
import com.cloudflow.hr.domain.dto.AttendanceMonthlyQueryDTO;
import com.cloudflow.hr.domain.dto.AttendanceReportExportDTO;
import com.cloudflow.hr.domain.entity.*;
import com.cloudflow.hr.domain.export.AttendanceMonthlyExportVO;
import com.cloudflow.hr.domain.vo.AttendanceAnomalyVO;
import com.cloudflow.hr.domain.vo.AttendanceMonthlyVO;
import com.cloudflow.hr.domain.vo.AttendanceRateVO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.*;
import com.cloudflow.hr.service.AttendanceStatisticsService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.BufferedWriter;
import java.io.IOException;
import java.io.OutputStream;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * 考勤统计服务实现类
 * 提供考勤月报生成、异常统计和报表导出功能
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AttendanceStatisticsServiceImpl implements AttendanceStatisticsService {

    private static final String TARGET_EMPLOYEE = "EMPLOYEE";
    private static final String TARGET_DEPT = "DEPT";
    private static final String PLAN_STATUS_PUBLISHED = "PUBLISHED";
    private static final int DEFAULT_WORKDAY_MINUTES = 480;

    private final AttendanceMonthlyMapper attendanceMonthlyMapper;
    private final AttendanceRecordMapper attendanceRecordMapper;
    private final EmployeeMapper employeeMapper;
    private final LeaveApplicationMapper leaveApplicationMapper;
    private final OvertimeApplicationMapper overtimeApplicationMapper;
    private final SchedulePlanMapper schedulePlanMapper;
    private final ShiftMapper shiftMapper;
    private final AuthServiceClient authServiceClient;

    /**
     * 生成月度考勤汇总（批量生成所有员工）
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void generateMonthlyAttendance(Integer year, Integer month) {
        log.info("开始生成月度考勤汇总，年份: {}, 月份: {}", year, month);

        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();

        // 查询所有在职员工
        LambdaQueryWrapper<Employee> employeeQuery = new LambdaQueryWrapper<>();
        employeeQuery.eq(Employee::getTenantId, tenantId)
                     .in(Employee::getEmployeeStatus, "PROBATION", "REGULAR");
        List<Employee> employees = employeeMapper.selectList(employeeQuery);

        log.info("找到 {} 名在职员工，开始生成考勤汇总", employees.size());

        // 为每个员工生成月度考勤汇总
        for (Employee employee : employees) {
            try {
                generateEmployeeMonthlyAttendance(employee.getId(), year, month);
            } catch (Exception e) {
                log.error("生成员工考勤汇总失败，员工ID: {}, 错误: {}", employee.getId(), e.getMessage(), e);
                // 继续处理下一个员工
            }
        }

        log.info("月度考勤汇总生成完成");
    }

    /**
     * 生成员工月度考勤汇总
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void generateEmployeeMonthlyAttendance(Long employeeId, Integer year, Integer month) {
        log.info("生成员工月度考勤汇总，员工ID: {}, 年份: {}, 月份: {}", employeeId, year, month);

        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();

        // 验证员工是否存在
        Employee employee = employeeMapper.selectById(employeeId);
        if (employee == null || !employee.getTenantId().equals(tenantId)) {
            throw new HrBusinessException("员工不存在");
        }

        // 计算月份的起止日期
        YearMonth yearMonth = YearMonth.of(year, month);
        LocalDate startDate = yearMonth.atDay(1);
        LocalDate endDate = yearMonth.atEndOfMonth();

        // 按生效排班计算应出勤天数，避免把无排班工作日误统计为应出勤。
        Set<LocalDate> scheduledDates = resolveScheduledDates(employee, startDate, endDate);
        int workDays = scheduledDates.size();
        Map<LocalDate, SchedulePlan> effectiveSchedulePlans = resolveEffectiveSchedulePlans(employee, startDate, endDate);

        // 统计打卡记录
        List<LeaveApplication> approvedLeaves = listApprovedLeavesForCoverage(tenantId, employeeId, startDate, endDate);
        Set<LocalDate> leaveDates = buildLeaveDateSet(approvedLeaves, startDate, endDate);
        Map<String, Integer> attendanceStats = calculateAttendanceStats(
                tenantId,
                employeeId,
                startDate,
                endDate,
                leaveDates,
                scheduledDates
        );

        // 统计请假天数
        BigDecimal leaveDays = calculateLeaveDays(approvedLeaves, startDate, endDate, effectiveSchedulePlans);

        // 统计加班时长
        BigDecimal overtimeHours = calculateOvertimeHours(tenantId, employeeId, year, month);

        // 计算实际出勤天数
        int actualDays = attendanceStats.get("actualDays");

        // 出勤率仅按排班日内的实际到岗计算，避免临时加班把出勤率抬高到 100% 以上。
        BigDecimal attendanceRate = calculateAttendanceRate(attendanceStats.get("scheduledActualDays"), workDays);

        // 查询或创建月度考勤记录
        LambdaQueryWrapper<AttendanceMonthly> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(AttendanceMonthly::getTenantId, tenantId)
                    .eq(AttendanceMonthly::getEmployeeId, employeeId)
                    .eq(AttendanceMonthly::getYear, year)
                    .eq(AttendanceMonthly::getMonth, month);
        AttendanceMonthly monthly = attendanceMonthlyMapper.selectOne(queryWrapper);

        if (monthly == null) {
            // 创建新记录
            monthly = new AttendanceMonthly();
            monthly.setTenantId(tenantId);
            monthly.setEmployeeId(employeeId);
            monthly.setYear(year);
            monthly.setMonth(month);
            monthly.setWorkDays(workDays);
            monthly.setActualDays(actualDays);
            monthly.setLateTimes(attendanceStats.get("lateTimes"));
            monthly.setEarlyTimes(attendanceStats.get("earlyTimes"));
            monthly.setAbsentDays(attendanceStats.get("absentDays"));
            monthly.setMissingTimes(attendanceStats.get("missingTimes"));
            monthly.setLeaveDays(leaveDays);
            monthly.setOvertimeHours(overtimeHours);
            monthly.setAttendanceRate(attendanceRate);
            monthly.setStatus("DRAFT");
            attendanceMonthlyMapper.insert(monthly);
        } else {
            // 更新现有记录
            monthly.setWorkDays(workDays);
            monthly.setActualDays(actualDays);
            monthly.setLateTimes(attendanceStats.get("lateTimes"));
            monthly.setEarlyTimes(attendanceStats.get("earlyTimes"));
            monthly.setAbsentDays(attendanceStats.get("absentDays"));
            monthly.setMissingTimes(attendanceStats.get("missingTimes"));
            monthly.setLeaveDays(leaveDays);
            monthly.setOvertimeHours(overtimeHours);
            monthly.setAttendanceRate(attendanceRate);
            attendanceMonthlyMapper.updateById(monthly);
        }

        log.info("员工月度考勤汇总生成成功，员工ID: {}, 出勤率: {}%", employeeId, attendanceRate);
    }

    /**
     * 获取员工月度考勤汇总
     */
    @Override
    public AttendanceMonthlyVO getMonthlyAttendance(Long employeeId, Integer year, Integer month) {
        log.info("获取员工月度考勤汇总，员工ID: {}, 年份: {}, 月份: {}", employeeId, year, month);

        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();

        // 查询月度考勤记录
        LambdaQueryWrapper<AttendanceMonthly> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(AttendanceMonthly::getTenantId, tenantId)
                    .eq(AttendanceMonthly::getEmployeeId, employeeId)
                    .eq(AttendanceMonthly::getYear, year)
                    .eq(AttendanceMonthly::getMonth, month);
        AttendanceMonthly monthly = attendanceMonthlyMapper.selectOne(queryWrapper);

        if (monthly == null) {
            throw new HrBusinessException("月度考勤记录不存在");
        }

        return convertToVO(monthly, new HashMap<>());
    }

    /**
     * 查询月度考勤汇总列表
     */
    @Override
    public List<AttendanceMonthlyVO> listMonthlyAttendance(AttendanceMonthlyQueryDTO query) {
        log.info("查询月度考勤汇总列表，查询条件: {}", query);

        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();

        // 构建查询条件
        LambdaQueryWrapper<AttendanceMonthly> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(AttendanceMonthly::getTenantId, tenantId)
                    .eq(query.getEmployeeId() != null, AttendanceMonthly::getEmployeeId, query.getEmployeeId())
                    .eq(query.getYear() != null, AttendanceMonthly::getYear, query.getYear())
                    .eq(query.getMonth() != null, AttendanceMonthly::getMonth, query.getMonth())
                    .eq(query.getStatus() != null, AttendanceMonthly::getStatus, query.getStatus())
                    .orderByDesc(AttendanceMonthly::getYear)
                    .orderByDesc(AttendanceMonthly::getMonth);

        // 如果指定了部门，需要关联员工表查询
        List<AttendanceMonthly> monthlies;
        if (query.getDeptId() != null) {
            // 先查询部门下的员工
            LambdaQueryWrapper<Employee> employeeQuery = new LambdaQueryWrapper<>();
            employeeQuery.eq(Employee::getTenantId, tenantId)
                         .eq(Employee::getDeptId, query.getDeptId());
            List<Employee> employees = employeeMapper.selectList(employeeQuery);
            List<Long> employeeIds = employees.stream().map(Employee::getId).collect(Collectors.toList());

            if (employeeIds.isEmpty()) {
                return List.of();
            }

            queryWrapper.in(AttendanceMonthly::getEmployeeId, employeeIds);
        }

        monthlies = attendanceMonthlyMapper.selectList(queryWrapper);

        // 转换为VO
        Map<Long, String> deptNameCache = new HashMap<>();
        return monthlies.stream()
                .map(monthly -> convertToVO(monthly, deptNameCache))
                .collect(Collectors.toList());
    }

    /**
     * 查询异常考勤统计
     */
    @Override
    public IPage<AttendanceAnomalyVO> listAttendanceAnomalies(AttendanceAnomalyQueryDTO query) {
        log.info("查询异常考勤统计，查询条件: {}", query);

        Long tenantId = SecurityUtils.getTenantId();
        LocalDate startDate = resolveAnomalyStartDate(query);
        LocalDate endDate = resolveAnomalyEndDate(query);

        if (startDate.isAfter(endDate)) {
            throw new HrBusinessException("异常考勤查询开始日期不能晚于结束日期");
        }

        Map<Long, String> deptNameCache = new HashMap<>();
        Map<Long, Shift> shiftCache = new HashMap<>();
        List<AttendanceAnomalyVO> results = new ArrayList<>();

        if (shouldQueryRecordAnomalies(query.getAnomalyType())) {
            List<Map<String, Object>> anomalies = attendanceMonthlyMapper.listAttendanceAnomalies(
                    tenantId,
                    query.getEmployeeId(),
                    query.getDeptId(),
                    query.getAnomalyType(),
                    startDate.toString(),
                    endDate.toString()
            );
            results.addAll(anomalies.stream()
                    .map(map -> convertToAnomalyVO(map, deptNameCache, shiftCache))
                    .collect(Collectors.toList()));
        }

        if (shouldBuildDerivedAnomalies(query.getAnomalyType())) {
            results.addAll(buildDerivedAnomalies(tenantId, query, startDate, endDate, deptNameCache, shiftCache));
        }

        results.sort(Comparator
                .comparing(AttendanceAnomalyVO::getAttendanceDate, Comparator.nullsLast(Comparator.reverseOrder()))
                .thenComparing(AttendanceAnomalyVO::getCheckTime, Comparator.nullsLast(Comparator.reverseOrder()))
                .thenComparing(AttendanceAnomalyVO::getEmployeeId, Comparator.nullsLast(Comparator.naturalOrder())));
        return paginateAnomalies(results, query);
    }

    /**
     * 获取部门出勤率分析
     */
    @Override
    public AttendanceRateVO getAttendanceRate(Long deptId, Integer year, Integer month) {
        log.info("获取部门出勤率分析，部门ID: {}, 年份: {}, 月份: {}", deptId, year, month);

        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();

        // 调用Mapper统计出勤率
        Map<String, Object> rateMap = attendanceMonthlyMapper.getAttendanceRate(tenantId, deptId, year, month);

        // 构建VO
        AttendanceRateVO rateVO = new AttendanceRateVO();
        rateVO.setDeptId(deptId);
        rateVO.setDeptName(resolveDeptName(deptId, new HashMap<>()));
        rateVO.setYear(year);
        rateVO.setMonth(month);
        rateVO.setTotalEmployees(getIntegerFromMap(rateMap, "totalEmployees"));
        rateVO.setTotalWorkDays(getIntegerFromMap(rateMap, "totalWorkDays"));
        rateVO.setTotalActualDays(getIntegerFromMap(rateMap, "totalActualDays"));
        rateVO.setAverageAttendanceRate(getBigDecimalFromMap(rateMap, "averageAttendanceRate"));
        rateVO.setTotalLateTimes(getIntegerFromMap(rateMap, "totalLateTimes"));
        rateVO.setTotalEarlyTimes(getIntegerFromMap(rateMap, "totalEarlyTimes"));
        rateVO.setTotalAbsentDays(getIntegerFromMap(rateMap, "totalAbsentDays"));
        rateVO.setTotalMissingTimes(getIntegerFromMap(rateMap, "totalMissingTimes"));

        return rateVO;
    }

    /**
     * 导出考勤报表
     */
    @Override
    public String exportAttendanceReport(AttendanceReportExportDTO dto) {
        log.info("导出考勤报表，参数: {}", dto);

        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();

        // 查询考勤数据
        AttendanceMonthlyQueryDTO query = new AttendanceMonthlyQueryDTO();
        query.setDeptId(dto.getDeptId());
        query.setYear(dto.getYear());
        query.setMonth(dto.getMonth());
        List<AttendanceMonthlyVO> monthlies = listMonthlyAttendance(query);
        List<AttendanceMonthlyExportVO> exportRows = monthlies.stream()
                .map(AttendanceMonthlyExportVO::from)
                .toList();
        Path exportDir = resolveDownloadDirectory("attendance");
        String fileName = String.format("attendance_%d_%02d_%s.csv",
                dto.getYear(),
                dto.getMonth(),
                DateTimeFormatter.ofPattern("yyyyMMddHHmmss").format(LocalDateTime.now()));
        Path filePath = exportDir.resolve(fileName);
        try {
            Files.createDirectories(exportDir);
            writeAttendanceCsv(exportRows, filePath);
        } catch (IOException e) {
            throw new HrBusinessException("考勤报表导出失败：" + e.getMessage());
        }

        // TODO: 实现Excel导出逻辑
        // 这里应该使用EasyExcel或POI生成Excel文件
        // 并上传到文件存储服务（MinIO/OSS）
        // 返回文件访问URL

        String fileUrl = "/download/attendance/" + fileName;
        log.info("考勤报表导出成功，文件URL: {}", fileUrl);

        return fileUrl;
    }

    private Path resolveDownloadDirectory(String relativePath) {
        Path basePath = Paths.get(CloudFlowConfig.getDownloadPath());
        if (!basePath.isAbsolute()) {
            String normalized = CloudFlowConfig.getDownloadPath();
            if (normalized.startsWith("/") || normalized.startsWith("\\")) {
                Path currentRoot = Paths.get(System.getProperty("user.dir")).toAbsolutePath().getRoot();
                if (currentRoot != null) {
                    normalized = currentRoot.resolve(normalized.replaceFirst("^[\\\\/]+", "")).toString();
                }
            } else {
                normalized = basePath.toAbsolutePath().toString();
            }
            basePath = Paths.get(normalized);
        }
        return basePath.resolve(relativePath).normalize();
    }

    private void writeAttendanceCsv(List<AttendanceMonthlyExportVO> exportRows, Path filePath) throws IOException {
        try (BufferedWriter writer = Files.newBufferedWriter(filePath, StandardCharsets.UTF_8)) {
            writer.write('\uFEFF');
            appendCsvLine(writer,
                    "统计月份", "员工工号", "员工姓名", "部门", "应出勤天数", "实际出勤天数",
                    "旷工天数", "缺卡次数", "迟到次数", "早退次数", "请假天数", "加班时长(小时)",
                    "出勤率(%)", "状态");
            for (AttendanceMonthlyExportVO row : exportRows) {
                appendCsvLine(writer,
                        row.getYearMonth(),
                        row.getEmployeeNo(),
                        row.getEmployeeName(),
                        row.getDeptName(),
                        toCsvValue(row.getWorkDays()),
                        toCsvValue(row.getActualDays()),
                        toCsvValue(row.getAbsentDays()),
                        toCsvValue(row.getMissingTimes()),
                        toCsvValue(row.getLateTimes()),
                        toCsvValue(row.getEarlyTimes()),
                        toCsvValue(row.getLeaveDays()),
                        toCsvValue(row.getOvertimeHours()),
                        toCsvValue(row.getAttendanceRate()),
                        row.getStatusName());
            }
        }
    }

    private void appendCsvLine(BufferedWriter writer, String... values) throws IOException {
        writer.write(java.util.Arrays.stream(values)
                .map(this::escapeCsv)
                .collect(Collectors.joining(",")));
        writer.newLine();
    }

    private String toCsvValue(Object value) {
        return value == null ? "" : value.toString();
    }

    private String escapeCsv(String value) {
        String safeValue = value == null ? "" : value;
        String escaped = safeValue.replace("\"", "\"\"");
        if (escaped.contains(",") || escaped.contains("\"") || escaped.contains("\n") || escaped.contains("\r")) {
            return "\"" + escaped + "\"";
        }
        return escaped;
    }

    // ==================== 私有辅助方法 ====================

    /**
     * 计算应出勤天数（简化版本，实际应根据排班计划计算）
     */
    private int calculateWorkDays(LocalDate startDate, LocalDate endDate) {
        int workDays = 0;
        LocalDate current = startDate;
        while (!current.isAfter(endDate)) {
            // 排除周六周日
            if (current.getDayOfWeek().getValue() < 6) {
                workDays++;
            }
            current = current.plusDays(1);
        }
        return workDays;
    }

    /**
     * 统计打卡记录
     */
    private Map<String, Integer> calculateAttendanceStats(Long tenantId, Long employeeId,
                                                           LocalDate startDate, LocalDate endDate,
                                                           Set<LocalDate> leaveDates,
                                                           Set<LocalDate> scheduledDates) {
        // 查询打卡记录
        LambdaQueryWrapper<AttendanceRecord> recordQuery = new LambdaQueryWrapper<>();
        recordQuery.eq(AttendanceRecord::getTenantId, tenantId)
                   .eq(AttendanceRecord::getEmployeeId, employeeId)
                   .ge(AttendanceRecord::getAttendanceDate, startDate)
                   .le(AttendanceRecord::getAttendanceDate, endDate);
        List<AttendanceRecord> records = attendanceRecordMapper.selectList(recordQuery).stream()
                .filter(this::isEffectiveAttendanceRecord)
                .collect(Collectors.toList());

        // 统计各类型数量
        int actualDays = 0;
        int scheduledActualDays = 0;
        int lateTimes = 0;
        int earlyTimes = 0;
        int missingTimes = 0;
        int absentDays = 0;

        // 按日期分组统计
        Map<LocalDate, List<AttendanceRecord>> recordsByDate = records.stream()
                .collect(Collectors.groupingBy(AttendanceRecord::getAttendanceDate));

        for (Map.Entry<LocalDate, List<AttendanceRecord>> entry : recordsByDate.entrySet()) {
            LocalDate attendanceDate = entry.getKey();
            List<AttendanceRecord> dayRecords = entry.getValue();

            boolean hasCheckIn = dayRecords.stream().anyMatch(r -> "CHECK_IN".equals(r.getCheckType()));
            boolean hasCheckOut = dayRecords.stream().anyMatch(r -> "CHECK_OUT".equals(r.getCheckType()));

            if (!hasCheckIn || !hasCheckOut) {
                missingTimes++;
            }

            actualDays++;
            if (scheduledDates.contains(attendanceDate)) {
                scheduledActualDays++;
            }

            // 统计迟到早退
            for (AttendanceRecord record : dayRecords) {
                if ("LATE".equals(record.getStatus())) {
                    lateTimes++;
                }
                if ("EARLY".equals(record.getStatus())) {
                    earlyTimes++;
                }
            }
        }

        for (LocalDate scheduledDate : scheduledDates) {
            if (!recordsByDate.containsKey(scheduledDate) && !leaveDates.contains(scheduledDate)) {
                absentDays++;
            }
        }

        return Map.of(
                "actualDays", actualDays,
                "scheduledActualDays", scheduledActualDays,
                "lateTimes", lateTimes,
                "earlyTimes", earlyTimes,
                "missingTimes", missingTimes,
                "absentDays", absentDays
        );
    }

    /**
     * 统计请假天数
     */
    private BigDecimal calculateLeaveDays(List<LeaveApplication> leaves,
                                          LocalDate startDate,
                                          LocalDate endDate,
                                          Map<LocalDate, SchedulePlan> effectiveSchedulePlans) {
        if (leaves == null || leaves.isEmpty()) {
            return BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
        }

        BigDecimal totalLeaveDays = BigDecimal.ZERO;
        Map<Long, Integer> shiftWorkMinutesCache = new HashMap<>();
        for (LeaveApplication leave : leaves) {
            totalLeaveDays = totalLeaveDays.add(calculateLeaveDaysWithinRange(
                    leave,
                    startDate,
                    endDate,
                    effectiveSchedulePlans,
                    shiftWorkMinutesCache
            ));
        }
        return totalLeaveDays.setScale(2, RoundingMode.HALF_UP);
    }

    private BigDecimal calculateLeaveDaysWithinRange(LeaveApplication leave,
                                                     LocalDate startDate,
                                                     LocalDate endDate,
                                                     Map<LocalDate, SchedulePlan> effectiveSchedulePlans,
                                                     Map<Long, Integer> shiftWorkMinutesCache) {
        if (leave == null || leave.getStartTime() == null || leave.getEndTime() == null) {
            return BigDecimal.ZERO;
        }

        LocalDateTime rangeStart = startDate.atStartOfDay();
        LocalDateTime rangeEndExclusive = endDate.plusDays(1).atStartOfDay();
        LocalDateTime overlapStart = leave.getStartTime().isAfter(rangeStart) ? leave.getStartTime() : rangeStart;
        LocalDateTime overlapEndExclusive = leave.getEndTime().isBefore(rangeEndExclusive) ? leave.getEndTime() : rangeEndExclusive;

        if (!overlapEndExclusive.isAfter(overlapStart)) {
            return BigDecimal.ZERO;
        }

        if ("HOUR".equalsIgnoreCase(leave.getUnit())) {
            return calculateHourlyLeaveDays(
                    overlapStart,
                    overlapEndExclusive,
                    effectiveSchedulePlans,
                    shiftWorkMinutesCache
            );
        }

        long overlapDays = ChronoUnit.DAYS.between(
                overlapStart.toLocalDate(),
                overlapEndExclusive.minusNanos(1).toLocalDate()
        ) + 1;
        return BigDecimal.valueOf(overlapDays);
    }

    private List<LeaveApplication> listApprovedLeavesForCoverage(Long tenantId, Long employeeId,
                                                                 LocalDate startDate, LocalDate endDate) {
        LambdaQueryWrapper<LeaveApplication> leaveQuery = new LambdaQueryWrapper<>();
        leaveQuery.eq(LeaveApplication::getTenantId, tenantId)
                .eq(LeaveApplication::getEmployeeId, employeeId)
                .eq(LeaveApplication::getStatus, "APPROVED")
                .le(LeaveApplication::getStartTime, endDate.atTime(23, 59, 59))
                .ge(LeaveApplication::getEndTime, startDate.atStartOfDay());

        return leaveApplicationMapper.selectList(leaveQuery);
    }

    private Set<LocalDate> buildLeaveDateSet(List<LeaveApplication> approvedLeaves,
                                             LocalDate startDate,
                                             LocalDate endDate) {
        Set<LocalDate> leaveDates = new HashSet<>();
        for (LeaveApplication leave : approvedLeaves) {
            LocalDate current = leave.getStartTime().toLocalDate();
            LocalDate end = leave.getEndTime().toLocalDate();
            if (current.isBefore(startDate)) {
                current = startDate;
            }
            if (end.isAfter(endDate)) {
                end = endDate;
            }
            while (!current.isAfter(end)) {
                leaveDates.add(current);
                current = current.plusDays(1);
            }
        }
        return leaveDates;
    }

    private BigDecimal calculateHourlyLeaveDays(LocalDateTime overlapStart,
                                                LocalDateTime overlapEndExclusive,
                                                Map<LocalDate, SchedulePlan> effectiveSchedulePlans,
                                                Map<Long, Integer> shiftWorkMinutesCache) {
        BigDecimal leaveDays = BigDecimal.ZERO;
        LocalDateTime current = overlapStart;
        while (current.isBefore(overlapEndExclusive)) {
            LocalDate currentDate = current.toLocalDate();
            LocalDateTime dayEndExclusive = currentDate.plusDays(1).atStartOfDay();
            LocalDateTime segmentEnd = overlapEndExclusive.isBefore(dayEndExclusive)
                    ? overlapEndExclusive
                    : dayEndExclusive;
            long leaveMinutes = Duration.between(current, segmentEnd).toMinutes();
            if (leaveMinutes > 0) {
                int workMinutes = resolveWorkMinutes(currentDate, effectiveSchedulePlans, shiftWorkMinutesCache);
                leaveDays = leaveDays.add(
                        BigDecimal.valueOf(leaveMinutes)
                                .divide(BigDecimal.valueOf(workMinutes), 4, RoundingMode.HALF_UP)
                );
            }
            current = segmentEnd;
        }
        return leaveDays;
    }

    private int resolveWorkMinutes(LocalDate attendanceDate,
                                   Map<LocalDate, SchedulePlan> effectiveSchedulePlans,
                                   Map<Long, Integer> shiftWorkMinutesCache) {
        SchedulePlan schedulePlan = effectiveSchedulePlans.get(attendanceDate);
        if (schedulePlan == null || schedulePlan.getShiftId() == null) {
            return DEFAULT_WORKDAY_MINUTES;
        }
        return shiftWorkMinutesCache.computeIfAbsent(schedulePlan.getShiftId(), this::loadShiftWorkMinutes);
    }

    private Integer loadShiftWorkMinutes(Long shiftId) {
        if (shiftId == null) {
            return DEFAULT_WORKDAY_MINUTES;
        }
        Shift shift = shiftMapper.selectById(shiftId);
        if (shift == null || shift.getWorkMinutes() == null || shift.getWorkMinutes() <= 0) {
            return DEFAULT_WORKDAY_MINUTES;
        }
        return shift.getWorkMinutes();
    }

    private Set<LocalDate> resolveScheduledDates(Employee employee, LocalDate startDate, LocalDate endDate) {
        return resolveEffectiveSchedulePlans(employee, startDate, endDate).keySet();
    }

    private Map<LocalDate, SchedulePlan> resolveEffectiveSchedulePlans(Employee employee,
                                                                       LocalDate startDate,
                                                                       LocalDate endDate) {
        Map<LocalDate, SchedulePlan> effectivePlans = new HashMap<>();

        if (employee.getDeptId() != null) {
            mergePublishedPlans(
                    effectivePlans,
                    schedulePlanMapper.selectByDateRange(employee.getTenantId(), TARGET_DEPT, employee.getDeptId(), startDate, endDate)
            );
        }

        mergePublishedPlans(
                effectivePlans,
                schedulePlanMapper.selectByDateRange(employee.getTenantId(), TARGET_EMPLOYEE, employee.getId(), startDate, endDate)
        );

        effectivePlans.entrySet().removeIf(entry -> entry.getValue() == null
                || entry.getValue().getScheduleDate() == null
                || entry.getValue().getShiftId() == null);
        return effectivePlans;
    }

    private void mergePublishedPlans(Map<LocalDate, SchedulePlan> effectivePlans, List<SchedulePlan> plans) {
        if (plans == null || plans.isEmpty()) {
            return;
        }
        for (SchedulePlan plan : plans) {
            if (plan == null || !PLAN_STATUS_PUBLISHED.equals(plan.getStatus()) || plan.getScheduleDate() == null) {
                continue;
            }
            effectivePlans.put(plan.getScheduleDate(), plan);
        }
    }

    private boolean isEffectiveAttendanceRecord(AttendanceRecord record) {
        if (record == null || record.getStatus() == null) {
            return false;
        }
        switch (record.getStatus()) {
            case "NORMAL":
            case "LATE":
            case "EARLY":
            case "SUPPLEMENT":
                return true;
            default:
                return false;
        }
    }

    /**
     * 统计加班时长
     */
    private BigDecimal calculateOvertimeHours(Long tenantId, Long employeeId, Integer year, Integer month) {
        Map<String, Object> overtimeStats = overtimeApplicationMapper.getOvertimeStatistics(
                tenantId, employeeId, year, month);
        
        return getBigDecimalFromMap(overtimeStats, "totalHours");
    }

    /**
     * 计算出勤率
     */
    private BigDecimal calculateAttendanceRate(int actualDays, int workDays) {
        if (workDays == 0) {
            return BigDecimal.ZERO;
        }
        return new BigDecimal(actualDays)
                .multiply(new BigDecimal("100"))
                .divide(new BigDecimal(workDays), 2, RoundingMode.HALF_UP);
    }

    private LocalDate resolveAnomalyStartDate(AttendanceAnomalyQueryDTO query) {
        if (query.getStartDate() != null) {
            return query.getStartDate();
        }
        if (query.getEndDate() != null) {
            return query.getEndDate();
        }
        return LocalDate.now().withDayOfMonth(1);
    }

    private LocalDate resolveAnomalyEndDate(AttendanceAnomalyQueryDTO query) {
        if (query.getEndDate() != null) {
            return query.getEndDate();
        }
        if (query.getStartDate() != null) {
            return query.getStartDate();
        }
        return LocalDate.now();
    }

    private boolean shouldQueryRecordAnomalies(String anomalyType) {
        return anomalyType == null || "LATE".equals(anomalyType) || "EARLY".equals(anomalyType);
    }

    private boolean shouldBuildDerivedAnomalies(String anomalyType) {
        return anomalyType == null || "MISSING".equals(anomalyType) || "ABSENT".equals(anomalyType);
    }

    private List<AttendanceAnomalyVO> buildDerivedAnomalies(Long tenantId,
                                                            AttendanceAnomalyQueryDTO query,
                                                            LocalDate startDate,
                                                            LocalDate endDate,
                                                            Map<Long, String> deptNameCache,
                                                            Map<Long, Shift> shiftCache) {
        boolean includeMissing = query.getAnomalyType() == null || "MISSING".equals(query.getAnomalyType());
        boolean includeAbsent = query.getAnomalyType() == null || "ABSENT".equals(query.getAnomalyType());
        List<Employee> employees = listAnomalyEmployees(tenantId, query);
        if (employees.isEmpty()) {
            return List.of();
        }

        List<AttendanceAnomalyVO> derivedAnomalies = new ArrayList<>();
        for (Employee employee : employees) {
            Map<LocalDate, SchedulePlan> scheduledPlans = resolveEffectiveSchedulePlans(employee, startDate, endDate);
            Map<LocalDate, List<AttendanceRecord>> recordsByDate = listEffectiveAttendanceRecordsByDate(
                    tenantId,
                    employee.getId(),
                    startDate,
                    endDate
            );

            if (includeMissing) {
                for (Map.Entry<LocalDate, List<AttendanceRecord>> entry : recordsByDate.entrySet()) {
                    String missingCheckType = resolveMissingCheckType(entry.getValue());
                    if (missingCheckType == null) {
                        continue;
                    }
                    derivedAnomalies.add(buildMissingAnomalyVO(
                            employee,
                            entry.getKey(),
                            scheduledPlans.get(entry.getKey()),
                            missingCheckType,
                            deptNameCache,
                            shiftCache
                    ));
                }
            }

            if (includeAbsent && !scheduledPlans.isEmpty()) {
                Set<LocalDate> leaveDates = buildLeaveDateSet(
                        listApprovedLeavesForCoverage(tenantId, employee.getId(), startDate, endDate),
                        startDate,
                        endDate
                );
                for (Map.Entry<LocalDate, SchedulePlan> entry : scheduledPlans.entrySet()) {
                    LocalDate attendanceDate = entry.getKey();
                    if (leaveDates.contains(attendanceDate) || recordsByDate.containsKey(attendanceDate)) {
                        continue;
                    }
                    derivedAnomalies.add(buildAbsentAnomalyVO(employee, entry.getValue(), deptNameCache, shiftCache));
                }
            }
        }
        return derivedAnomalies;
    }

    private List<Employee> listAnomalyEmployees(Long tenantId, AttendanceAnomalyQueryDTO query) {
        LambdaQueryWrapper<Employee> employeeQuery = new LambdaQueryWrapper<>();
        employeeQuery.eq(Employee::getTenantId, tenantId)
                .eq(query.getEmployeeId() != null, Employee::getId, query.getEmployeeId())
                .eq(query.getDeptId() != null, Employee::getDeptId, query.getDeptId());
        return employeeMapper.selectList(employeeQuery);
    }

    private Map<LocalDate, List<AttendanceRecord>> listEffectiveAttendanceRecordsByDate(Long tenantId,
                                                                                        Long employeeId,
                                                                                        LocalDate startDate,
                                                                                        LocalDate endDate) {
        LambdaQueryWrapper<AttendanceRecord> recordQuery = new LambdaQueryWrapper<>();
        recordQuery.eq(AttendanceRecord::getTenantId, tenantId)
                .eq(AttendanceRecord::getEmployeeId, employeeId)
                .ge(AttendanceRecord::getAttendanceDate, startDate)
                .le(AttendanceRecord::getAttendanceDate, endDate);
        return attendanceRecordMapper.selectList(recordQuery).stream()
                .filter(this::isEffectiveAttendanceRecord)
                .collect(Collectors.groupingBy(AttendanceRecord::getAttendanceDate));
    }

    private String resolveMissingCheckType(List<AttendanceRecord> dayRecords) {
        boolean hasCheckIn = dayRecords.stream().anyMatch(record -> "CHECK_IN".equals(record.getCheckType()));
        boolean hasCheckOut = dayRecords.stream().anyMatch(record -> "CHECK_OUT".equals(record.getCheckType()));
        if (!hasCheckIn && hasCheckOut) {
            return "CHECK_IN";
        }
        if (hasCheckIn && !hasCheckOut) {
            return "CHECK_OUT";
        }
        return null;
    }

    private AttendanceAnomalyVO buildMissingAnomalyVO(Employee employee,
                                                      LocalDate attendanceDate,
                                                      SchedulePlan schedulePlan,
                                                      String missingCheckType,
                                                      Map<Long, String> deptNameCache,
                                                      Map<Long, Shift> shiftCache) {
        AttendanceAnomalyVO vo = new AttendanceAnomalyVO();
        vo.setEmployeeId(employee.getId());
        vo.setEmployeeName(employee.getName());
        vo.setEmployeeNo(employee.getEmployeeNo());
        vo.setDeptName(resolveDeptName(employee.getDeptId(), deptNameCache));
        vo.setAttendanceDate(attendanceDate);
        vo.setAnomalyType("MISSING");
        vo.setAnomalyTypeName("缺卡");

        if (schedulePlan != null && schedulePlan.getShiftId() != null) {
            Shift shift = shiftCache.computeIfAbsent(schedulePlan.getShiftId(), shiftMapper::selectById);
            if (shift != null) {
                if ("CHECK_IN".equals(missingCheckType) && shift.getStartTime() != null) {
                    vo.setExpectedTime(attendanceDate.atTime(shift.getStartTime()));
                }
                if ("CHECK_OUT".equals(missingCheckType) && shift.getEndTime() != null) {
                    vo.setExpectedTime(attendanceDate.atTime(shift.getEndTime()));
                }
            }
        }

        vo.setDescription(buildAnomalyDescription(vo, missingCheckType, null));
        return vo;
    }

    private AttendanceAnomalyVO buildAbsentAnomalyVO(Employee employee,
                                                     SchedulePlan schedulePlan,
                                                     Map<Long, String> deptNameCache,
                                                     Map<Long, Shift> shiftCache) {
        AttendanceAnomalyVO vo = new AttendanceAnomalyVO();
        vo.setEmployeeId(employee.getId());
        vo.setEmployeeName(employee.getName());
        vo.setEmployeeNo(employee.getEmployeeNo());
        vo.setDeptName(resolveDeptName(employee.getDeptId(), deptNameCache));
        vo.setAttendanceDate(schedulePlan.getScheduleDate());
        vo.setAnomalyType("ABSENT");
        vo.setAnomalyTypeName("旷工");

        if (schedulePlan.getShiftId() != null) {
            Shift shift = shiftCache.computeIfAbsent(schedulePlan.getShiftId(), shiftMapper::selectById);
            if (shift != null && shift.getStartTime() != null) {
                vo.setExpectedTime(schedulePlan.getScheduleDate().atTime(shift.getStartTime()));
            }
        }

        vo.setDescription(buildAnomalyDescription(vo, null, null));
        return vo;
    }

    private IPage<AttendanceAnomalyVO> paginateAnomalies(List<AttendanceAnomalyVO> results,
                                                         AttendanceAnomalyQueryDTO query) {
        long pageNum = query.getPageNum() == null || query.getPageNum() < 1 ? 1L : query.getPageNum();
        long pageSize = query.getPageSize() == null || query.getPageSize() < 1 ? 10L : query.getPageSize();

        Page<AttendanceAnomalyVO> page = new Page<>(pageNum, pageSize);
        page.setTotal(results.size());

        int fromIndex = (int) Math.min((pageNum - 1) * pageSize, results.size());
        int toIndex = (int) Math.min(fromIndex + pageSize, results.size());
        page.setRecords(fromIndex >= toIndex ? List.of() : results.subList(fromIndex, toIndex));
        return page;
    }

    /**
     * 转换为VO
     */
    private AttendanceMonthlyVO convertToVO(AttendanceMonthly monthly, Map<Long, String> deptNameCache) {
        AttendanceMonthlyVO vo = new AttendanceMonthlyVO();
        BeanUtils.copyProperties(monthly, vo);

        // 查询员工信息
        Employee employee = employeeMapper.selectById(monthly.getEmployeeId());
        if (employee != null) {
            vo.setEmployeeName(employee.getName());
            vo.setEmployeeNo(employee.getEmployeeNo());
            vo.setDeptId(employee.getDeptId());
            vo.setDeptName(resolveDeptName(employee.getDeptId(), deptNameCache));
            // TODO: 查询部门名称
        }

        // 设置状态名称
        vo.setStatusName(getStatusName(monthly.getStatus()));

        return vo;
    }

    private String resolveDeptName(Long deptId, Map<Long, String> deptNameCache) {
        if (deptId == null) {
            return null;
        }
        if (deptNameCache.containsKey(deptId)) {
            return deptNameCache.get(deptId);
        }
        String deptName = null;
        try {
            R<DeptVO> result = authServiceClient.getDeptById(deptId);
            if (result != null && result.isSuccess() && result.getData() != null) {
                deptName = result.getData().getDeptName();
            }
        } catch (Exception e) {
            log.warn("查询部门名称失败，deptId={}", deptId, e);
        }
        deptNameCache.put(deptId, deptName);
        return deptName;
    }

    private LocalDateTime resolveExpectedTime(Map<String, Object> map, Map<Long, Shift> shiftCache) {
        Long shiftId = getLongFromMap(map, "shiftId");
        LocalDate attendanceDate = getLocalDateFromMap(map, "attendanceDate");
        String checkType = getStringFromMap(map, "checkType");
        if (shiftId == null || attendanceDate == null || checkType == null) {
            return null;
        }
        Shift shift = shiftCache.computeIfAbsent(shiftId, shiftMapper::selectById);
        if (shift == null) {
            return null;
        }
        if ("CHECK_IN".equals(checkType) && shift.getStartTime() != null) {
            return attendanceDate.atTime(shift.getStartTime());
        }
        if ("CHECK_OUT".equals(checkType) && shift.getEndTime() != null) {
            return attendanceDate.atTime(shift.getEndTime());
        }
        return null;
    }

    private String buildAnomalyDescription(AttendanceAnomalyVO vo, String checkType, String remark) {
        if (remark != null && !remark.isBlank()) {
            return remark;
        }
        String action = "CHECK_OUT".equals(checkType) ? "下班打卡" : "上班打卡";
        if (("LATE".equals(vo.getAnomalyType()) || "EARLY".equals(vo.getAnomalyType()))
                && vo.getExpectedTime() != null && vo.getCheckTime() != null) {
            return String.format("%s应于%s完成，实际打卡时间为%s",
                    action,
                    vo.getExpectedTime().toLocalTime(),
                    vo.getCheckTime().toLocalTime());
        }
        if ("MISSING".equals(vo.getAnomalyType())) {
            return String.format("%s缺少打卡记录", action);
        }
        if ("ABSENT".equals(vo.getAnomalyType())) {
            return "当日无有效考勤记录";
        }
        return vo.getAnomalyTypeName();
    }

    /**
     * 转换为异常考勤VO
     */
    private AttendanceAnomalyVO convertToAnomalyVO(Map<String, Object> map,
                                                   Map<Long, String> deptNameCache,
                                                   Map<Long, Shift> shiftCache) {
        AttendanceAnomalyVO vo = new AttendanceAnomalyVO();
        vo.setEmployeeId(getLongFromMap(map, "employeeId"));
        vo.setEmployeeName(getStringFromMap(map, "employeeName"));
        vo.setEmployeeNo(getStringFromMap(map, "employeeNo"));
        vo.setDeptName(resolveDeptName(getLongFromMap(map, "deptId"), deptNameCache));
        vo.setAttendanceDate(getLocalDateFromMap(map, "attendanceDate"));
        vo.setAnomalyType(getStringFromMap(map, "anomalyType"));
        vo.setAnomalyTypeName(getStringFromMap(map, "anomalyTypeName"));
        vo.setCheckTime(getLocalDateTimeFromMap(map, "checkTime"));
        vo.setExpectedTime(resolveExpectedTime(map, shiftCache));
        vo.setDescription(buildAnomalyDescription(vo, getStringFromMap(map, "checkType"), getStringFromMap(map, "remark")));
        // TODO: 设置其他字段
        return vo;
    }

    /**
     * 获取状态名称
     */
    private String getStatusName(String status) {
        switch (status) {
            case "DRAFT":
                return "草稿";
            case "CONFIRMED":
                return "已确认";
            default:
                return status;
        }
    }

    /**
     * 从Map中获取BigDecimal值
     */
    private BigDecimal getBigDecimalFromMap(Map<String, Object> map, String key) {
        Object value = map.get(key);
        if (value == null) {
            return BigDecimal.ZERO;
        }
        if (value instanceof BigDecimal) {
            return (BigDecimal) value;
        }
        return new BigDecimal(value.toString());
    }

    /**
     * 从Map中获取Integer值
     */
    private Integer getIntegerFromMap(Map<String, Object> map, String key) {
        Object value = map.get(key);
        if (value == null) {
            return 0;
        }
        if (value instanceof Integer) {
            return (Integer) value;
        }
        if (value instanceof Long) {
            return ((Long) value).intValue();
        }
        return Integer.parseInt(value.toString());
    }

    /**
     * 从Map中获取Long值
     */
    private Long getLongFromMap(Map<String, Object> map, String key) {
        Object value = map.get(key);
        if (value == null) {
            return null;
        }
        if (value instanceof Long) {
            return (Long) value;
        }
        return Long.parseLong(value.toString());
    }

    /**
     * 从Map中获取String值
     */
    private String getStringFromMap(Map<String, Object> map, String key) {
        Object value = map.get(key);
        return value != null ? value.toString() : null;
    }

    /**
     * 从Map中获取LocalDate值
     */
    private LocalDate getLocalDateFromMap(Map<String, Object> map, String key) {
        Object value = map.get(key);
        if (value == null) {
            return null;
        }
        if (value instanceof LocalDate) {
            return (LocalDate) value;
        }
        return LocalDate.parse(value.toString());
    }

    private LocalDateTime getLocalDateTimeFromMap(Map<String, Object> map, String key) {
        Object value = map.get(key);
        if (value == null) {
            return null;
        }
        if (value instanceof LocalDateTime) {
            return (LocalDateTime) value;
        }
        return LocalDateTime.parse(value.toString().replace(" ", "T"));
    }
}
