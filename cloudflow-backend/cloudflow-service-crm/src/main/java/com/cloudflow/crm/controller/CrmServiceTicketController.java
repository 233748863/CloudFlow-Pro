package com.cloudflow.crm.controller;

import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.crm.domain.CrmServiceTicket;
import com.cloudflow.crm.service.ICrmServiceTicketService;
import lombok.RequiredArgsConstructor;
import cn.dev33.satoken.annotation.SaCheckLogin;
import cn.dev33.satoken.annotation.SaCheckPermission;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/ticket")
@SaCheckLogin
@RequiredArgsConstructor
public class CrmServiceTicketController {

    private final ICrmServiceTicketService crmServiceTicketService;
    private final com.cloudflow.crm.service.ICrmCustomerService customerService;

    @GetMapping("/list")
    @SaCheckPermission("crm:ticket:list")
    public R<PageResult<CrmServiceTicket>> list(CrmServiceTicket query, PageQuery pageQuery) {
        return R.ok(crmServiceTicketService.queryPage(query, pageQuery));
    }

    @GetMapping("/{id}")
    @SaCheckPermission("crm:ticket:list")
    public R<CrmServiceTicket> getInfo(@PathVariable("id") Long id) {
        try {
            return R.ok(crmServiceTicketService.getAccessibleTicket(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("新增CRM工单")
    // M0-8: 防重复提交
    @RepeatSubmit
    @PostMapping
    @SaCheckPermission("crm:ticket:add")
    public R<Void> add(@RequestBody CrmServiceTicket ticket) {
        try {
            return R.result(crmServiceTicketService.createTicket(ticket));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("修改CRM工单")
    @PutMapping
    @SaCheckPermission("crm:ticket:edit")
    public R<Void> edit(@RequestBody CrmServiceTicket ticket) {
        try {
            return R.result(crmServiceTicketService.updateTicket(ticket));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("解决CRM工单")
    @PostMapping("/{id}/resolve")
    @SaCheckPermission("crm:ticket:resolve")
    public R<Void> resolve(@PathVariable("id") Long id, @RequestBody(required = false) CrmServiceTicket payload) {
        try {
            return R.result(crmServiceTicketService.resolveTicket(id, payload != null ? payload.getSolution() : null));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("关闭CRM工单")
    @PostMapping("/{id}/close")
    @SaCheckPermission("crm:ticket:close")
    public R<Void> close(@PathVariable("id") Long id) {
        try {
            return R.result(crmServiceTicketService.closeTicket(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("删除CRM工单")
    @DeleteMapping("/{ids}")
    @SaCheckPermission("crm:ticket:remove")
    public R<Void> remove(@PathVariable("ids") List<Long> ids) {
        for (Long id : ids) {
            CrmServiceTicket persisted;
            try {
                persisted = crmServiceTicketService.getAccessibleTicket(id);
            } catch (IllegalArgumentException e) {
                return R.fail(e.getMessage());
            }
            CrmServiceTicket ticket = new CrmServiceTicket();
            ticket.setTicketId(id);
            ticket.setDeleted(1);
            crmServiceTicketService.updateById(ticket);
            customerService.refreshHealth(persisted.getCustomerId());
        }
        return R.ok();
    }
}
