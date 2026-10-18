package com.cloudflow.crm.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.crm.domain.CrmServiceTicket;
import com.cloudflow.crm.domain.CrmSlaPolicy;
import com.cloudflow.crm.domain.CrmSlaPriority;
import com.cloudflow.crm.domain.dto.CrmSlaPolicyRequest;
import com.cloudflow.crm.domain.dto.CrmSlaReportQuery;
import com.cloudflow.crm.service.impl.*;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDateTime;
import java.util.List;

@RestController
@RequestMapping("/sla")
@RequiredArgsConstructor
public class CrmSlaController {
    private final CrmSlaPolicyService policies;
    private final CrmSlaPriorityCatalog catalog;
    private final CrmSlaService sla;
    private final CrmSlaReportService reports;
    private final CrmReferenceService references;
    private final com.cloudflow.common.holiday.mapper.HolidayCalendarMapper calendarMapper;

    @GetMapping("/calendars")
    @SaCheckPermission("crm:sla:list")
    public R<List<com.cloudflow.common.holiday.domain.HolidayCalendar>> calendars() {
        return R.ok(calendarMapper.selectList(new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<com.cloudflow.common.holiday.domain.HolidayCalendar>()
                .eq("status", "ENABLED").eq("deleted", 0).orderByDesc("default_flag")));
    }

    @GetMapping("/policy/list")
    @SaCheckPermission("crm:sla:list")
    public R<PageResult<CrmSlaPolicy>> list(PageQuery page) { return R.ok(policies.page(page)); }

    @GetMapping("/policy/{id}")
    @SaCheckPermission("crm:sla:list")
    public R<CrmSlaPolicyRequest> detail(@PathVariable Long id) { return R.ok(policies.detail(id)); }

    @GetMapping("/priorities")
    @SaCheckPermission("crm:sla:list")
    public R<List<CrmSlaPriority>> priorities() { return R.ok(catalog.defaults()); }

    @PostMapping("/policy")
    @RepeatSubmit
    @SysLog("保存CRM服务等级策略")
    @SaCheckPermission("crm:sla:edit")
    public R<Long> save(@Valid @RequestBody CrmSlaPolicyRequest request) { return R.ok(policies.save(request)); }

    @PostMapping("/policy/{id}/disable")
    @RepeatSubmit
    @SysLog("停用CRM服务等级策略")
    @SaCheckPermission("crm:sla:edit")
    public R<Void> disable(@PathVariable Long id) { policies.disable(id); return R.ok(); }

    @PostMapping("/preview")
    @RepeatSubmit.Disabled
    @SaCheckPermission("crm:sla:list")
    public R<CrmServiceTicket> preview(@RequestBody Preview request) {
        references.customer(request.customerId());
        CrmServiceTicket ticket = new CrmServiceTicket(); ticket.setCustomerId(request.customerId());
        ticket.setSeverity(CrmRecordSupport.code(request.severity(), "P4", CrmSlaPriorityCatalog.CODES, "工单优先级"));
        ticket.setOpenedTime(request.openedTime() == null ? LocalDateTime.now() : request.openedTime());
        ticket.setTicketNo("PREVIEW"); ticket.setTicketTitle("SLA试算"); ticket.setStatus("OPEN");
        sla.initialize(ticket); return R.ok(ticket);
    }

    @GetMapping("/report")
    @SaCheckPermission("crm:sla:report")
    public R<CrmSlaReportService.Report> report(CrmSlaReportQuery query) { return R.ok(reports.report(query)); }

    public record Preview(Long customerId, String severity,
            @com.fasterxml.jackson.annotation.JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime openedTime) { }
}
