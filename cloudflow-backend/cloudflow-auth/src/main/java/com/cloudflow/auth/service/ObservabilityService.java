package com.cloudflow.auth.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.auth.domain.vo.ObservabilityModels;
import com.cloudflow.auth.mapper.ObservabilityMapper;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.TraceContext;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.core.utils.LogSanitizer;
import com.cloudflow.common.log.domain.SysApiErrorLog;
import com.cloudflow.common.log.domain.SysLogEntity;
import com.cloudflow.common.log.mapper.SysApiErrorLogMapper;
import com.cloudflow.common.log.mapper.SysLogMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class ObservabilityService {
    private static final Set<String> STATUSES = Set.of("TODO", "PROCESSING", "DONE", "IGNORED");
    private final SysApiErrorLogMapper errors;
    private final SysLogMapper operations;
    private final ObservabilityMapper queries;

    public PageResult<SysApiErrorLog> errors(int pageNum, int pageSize, String serviceName, String exceptionClass,
                                           String status, String traceId, LocalDate start, LocalDate end) {
        validatePage(pageNum, pageSize);
        LocalDateTime[] range = range(start, end);
        if (StringUtils.hasText(status) && !STATUSES.contains(status)) throw new ServiceException("未知错误处理状态");
        LambdaQueryWrapper<SysApiErrorLog> query = new LambdaQueryWrapper<SysApiErrorLog>()
                .eq(SysApiErrorLog::getTenantId, tenantId())
                .eq(StringUtils.hasText(serviceName), SysApiErrorLog::getServiceName, serviceName)
                .like(StringUtils.hasText(exceptionClass), SysApiErrorLog::getExceptionClass, exceptionClass)
                .eq(StringUtils.hasText(status), SysApiErrorLog::getProcessStatus, status)
                .eq(StringUtils.hasText(traceId), SysApiErrorLog::getTraceId, traceId)
                .ge(SysApiErrorLog::getOccurTime, range[0]).lt(SysApiErrorLog::getOccurTime, range[1])
                .orderByDesc(SysApiErrorLog::getOccurTime, SysApiErrorLog::getErrorId);
        query.select(SysApiErrorLog.class, field -> !Set.of("exception_stack", "request_params").contains(field.getColumn()));
        return PageResult.build(errors.selectPage(new Page<>(pageNum, pageSize), query));
    }

    public SysApiErrorLog detail(Long errorId) {
        SysApiErrorLog entry = errors.selectOne(new LambdaQueryWrapper<SysApiErrorLog>()
                .eq(SysApiErrorLog::getTenantId, tenantId()).eq(SysApiErrorLog::getErrorId, errorId));
        if (entry == null) throw new ServiceException("错误记录不存在或无权访问", 404);
        return entry;
    }

    @Audit(name = "处理API错误日志")
    public void process(Long errorId, String expectedStatus, String status, String remark) {
        if (!STATUSES.contains(status) || !STATUSES.contains(expectedStatus)) throw new ServiceException("未知错误处理状态");
        if (queries.processError(tenantId(), errorId, expectedStatus, status, LogSanitizer.limit(remark, 500),
                LogSanitizer.limit(UserContext.getUserName(), 64)) != 1) {
            throw new ServiceException("记录不存在、无权访问或处理状态已变化，请刷新后重试", 409);
        }
    }

    public ObservabilityModels.TraceBundle trace(String traceId, int pageNum, int pageSize) {
        if (!TraceContext.isValid(traceId)) throw new ServiceException("追踪编号格式不正确");
        validatePage(pageNum, pageSize);
        Long tenantId = tenantId();
        Page<SysLogEntity> operationPage = operations.selectPage(new Page<>(pageNum, pageSize), new LambdaQueryWrapper<SysLogEntity>()
                .eq(SysLogEntity::getTenantId, tenantId).eq(SysLogEntity::getTraceId, traceId)
                .orderByAsc(SysLogEntity::getCreateTime, SysLogEntity::getLogId));
        Page<SysApiErrorLog> errorPage = errors.selectPage(new Page<>(pageNum, pageSize), new LambdaQueryWrapper<SysApiErrorLog>()
                .eq(SysApiErrorLog::getTenantId, tenantId).eq(SysApiErrorLog::getTraceId, traceId)
                .orderByAsc(SysApiErrorLog::getOccurTime, SysApiErrorLog::getErrorId));
        return new ObservabilityModels.TraceBundle(traceId, PageResult.build(operationPage), PageResult.build(errorPage),
                PageResult.build(queries.frontendTrace(new Page<>(pageNum, pageSize), tenantId, traceId)));
    }

    public List<ObservabilityModels.SlowEndpoint> slowTop(LocalDate start, LocalDate end, String sort) {
        if (!Set.of("duration", "volume").contains(sort)) throw new ServiceException("排序方式不正确");
        LocalDateTime[] range = range(start, end);
        return queries.slowTop(tenantId(), range[0], range[1], sort);
    }

    public List<ObservabilityModels.ErrorTrend> trend(LocalDate start, LocalDate end) {
        LocalDateTime[] range = range(start, end);
        List<ObservabilityModels.ErrorTrend> rows = queries.errorTrend(tenantId(), range[0], range[1]);
        java.util.Map<String, Long> counts = rows.stream().collect(java.util.stream.Collectors.toMap(
                ObservabilityModels.ErrorTrend::getDate, ObservabilityModels.ErrorTrend::getErrorCount));
        return range[0].toLocalDate().datesUntil(range[1].toLocalDate()).map(date -> {
            ObservabilityModels.ErrorTrend row = new ObservabilityModels.ErrorTrend();
            row.setDate(date.toString());
            row.setErrorCount(counts.getOrDefault(date.toString(), 0L));
            return row;
        }).toList();
    }

    private void validatePage(int pageNum, int pageSize) {
        if (pageNum < 1 || pageNum > 100000 || pageSize < 1 || pageSize > 200) throw new ServiceException("分页参数不正确");
    }

    private LocalDateTime[] range(LocalDate start, LocalDate end) {
        LocalDate until = end == null ? LocalDate.now() : end;
        LocalDate from = start == null ? until.minusDays(29) : start;
        if (from.isAfter(until) || java.time.temporal.ChronoUnit.DAYS.between(from, until) > 179) {
            throw new ServiceException("请选择不超过180天的有效日期范围");
        }
        return new LocalDateTime[]{from.atStartOfDay(), until.plusDays(1).atStartOfDay()};
    }

    private Long tenantId() {
        Long tenantId = UserContext.getTenantId();
        if (tenantId == null || UserContext.getUserId() == null) throw new ServiceException("缺少登录租户信息", 401);
        return tenantId;
    }
}
