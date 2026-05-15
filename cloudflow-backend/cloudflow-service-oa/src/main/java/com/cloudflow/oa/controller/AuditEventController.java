package com.cloudflow.oa.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.oa.domain.OaTraceEvent;
import com.cloudflow.oa.domain.dto.AuditEventQueryDTO;
import com.cloudflow.oa.domain.dto.TimelineEventDTO;
import com.cloudflow.oa.service.IOaTraceEventService;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;

/**
 * OA 全局审计台账。
 */
@RestController
@RequestMapping("/audit/events")
@RequiredArgsConstructor
public class AuditEventController {

    private static final int EXPORT_LIMIT = 5000;

    private final IOaTraceEventService traceEventService;

    @GetMapping
    @SaCheckPermission("system:audit:events")
    public R<Page<TimelineEventDTO>> list(@RequestParam(required = false) String businessType,
                                          @RequestParam(required = false) Long businessId,
                                          @RequestParam(required = false) String eventType,
                                          @RequestParam(required = false) String operatorName,
                                          @RequestParam(required = false) @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime beginTime,
                                          @RequestParam(required = false) @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime endTime,
                                          @RequestParam(defaultValue = "1") Integer pageNum,
                                          @RequestParam(defaultValue = "10") Integer pageSize) {
        Page<OaTraceEvent> page = traceEventService.queryAuditEvents(buildQuery(businessType, businessId, eventType,
                operatorName, beginTime, endTime, pageNum, pageSize));
        Page<TimelineEventDTO> result = new Page<>(page.getCurrent(), page.getSize(), page.getTotal());
        result.setRecords(page.getRecords().stream().map(TimelineEventDTO::from).toList());
        return R.ok(result);
    }

    @GetMapping("/export")
    @SaCheckPermission("system:audit:events")
    public void export(@RequestParam(required = false) String businessType,
                       @RequestParam(required = false) Long businessId,
                       @RequestParam(required = false) String eventType,
                       @RequestParam(required = false) String operatorName,
                       @RequestParam(required = false) @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime beginTime,
                       @RequestParam(required = false) @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime endTime,
                       HttpServletResponse response) throws IOException {
        AuditEventQueryDTO query = buildQuery(businessType, businessId, eventType, operatorName, beginTime, endTime, 1, EXPORT_LIMIT + 1);
        Page<OaTraceEvent> page = traceEventService.queryAuditEvents(query);
        if (page.getTotal() > EXPORT_LIMIT || page.getRecords().size() > EXPORT_LIMIT) {
            response.setStatus(HttpServletResponse.SC_BAD_REQUEST);
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write("{\"code\":500,\"msg\":\"导出结果超过5000条，请缩小筛选范围\"}");
            return;
        }
        String fileName = URLEncoder.encode("oa_audit_events.csv", StandardCharsets.UTF_8);
        response.setContentType("text/csv;charset=UTF-8");
        response.setHeader("Content-Disposition", "attachment; filename*=UTF-8''" + fileName);
        response.getWriter().write('\ufeff');
        response.getWriter().write("ID,业务类型,业务ID,事件类型,标题,内容,操作人,事件时间\n");
        for (OaTraceEvent event : page.getRecords()) {
            response.getWriter().write(toCsvLine(Arrays.asList(
                    event.getId(),
                    event.getBusinessType(),
                    event.getBusinessId(),
                    event.getEventType(),
                    event.getEventTitle(),
                    event.getEventContent(),
                    event.getOperatorName(),
                    event.getEventTime()
            )));
        }
    }

    private AuditEventQueryDTO buildQuery(String businessType, Long businessId, String eventType, String operatorName,
                                          LocalDateTime beginTime, LocalDateTime endTime, Integer pageNum, Integer pageSize) {
        AuditEventQueryDTO query = new AuditEventQueryDTO();
        query.setBusinessType(businessType);
        query.setBusinessId(businessId);
        query.setEventType(eventType);
        query.setOperatorName(operatorName);
        query.setBeginTime(beginTime);
        query.setEndTime(endTime);
        query.setPageNum(pageNum);
        query.setPageSize(pageSize);
        return query;
    }

    private String toCsvLine(List<Object> values) {
        return values.stream()
                .map(this::escapeCsv)
                .reduce((left, right) -> left + "," + right)
                .orElse("") + "\n";
    }

    private String escapeCsv(Object value) {
        String text = value == null ? "" : String.valueOf(value);
        String escaped = text.replace("\"", "\"\"");
        return "\"" + escaped + "\"";
    }
}
