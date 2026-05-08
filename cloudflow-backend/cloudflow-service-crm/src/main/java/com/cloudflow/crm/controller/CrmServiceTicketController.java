package com.cloudflow.crm.controller;

import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.crm.domain.CrmServiceTicket;
import com.cloudflow.crm.service.ICrmServiceTicketService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/ticket")
@RequiredArgsConstructor
public class CrmServiceTicketController {

    private final ICrmServiceTicketService ticketService;
    private final com.cloudflow.crm.service.ICrmCustomerService customerService;

    @GetMapping("/list")
    public R<PageResult<CrmServiceTicket>> list(CrmServiceTicket query, PageQuery pageQuery) {
        return R.ok(ticketService.queryPage(query, pageQuery));
    }

    @GetMapping("/{id}")
    public R<CrmServiceTicket> getInfo(@PathVariable("id") Long id) {
        CrmServiceTicket ticket = ticketService.getById(id);
        return ticket == null || !"0".equals(ticket.getDelFlag()) ? R.fail("工单不存在") : R.ok(ticket);
    }

    @SysLog("新增CRM工单")
    @PostMapping
    public R<Void> add(@RequestBody CrmServiceTicket ticket) {
        try {
            return R.result(ticketService.createTicket(ticket));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("修改CRM工单")
    @PutMapping
    public R<Void> edit(@RequestBody CrmServiceTicket ticket) {
        try {
            return R.result(ticketService.updateTicket(ticket));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("解决CRM工单")
    @PostMapping("/{id}/resolve")
    public R<Void> resolve(@PathVariable("id") Long id, @RequestBody(required = false) CrmServiceTicket payload) {
        try {
            return R.result(ticketService.resolveTicket(id, payload != null ? payload.getSolution() : null));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("关闭CRM工单")
    @PostMapping("/{id}/close")
    public R<Void> close(@PathVariable("id") Long id) {
        try {
            return R.result(ticketService.closeTicket(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("删除CRM工单")
    @DeleteMapping("/{ids}")
    public R<Void> remove(@PathVariable("ids") List<Long> ids) {
        for (Long id : ids) {
            CrmServiceTicket persisted = ticketService.getById(id);
            CrmServiceTicket ticket = new CrmServiceTicket();
            ticket.setTicketId(id);
            ticket.setDelFlag("1");
            ticketService.updateById(ticket);
            if (persisted != null) {
                customerService.refreshHealth(persisted.getCustomerId());
            }
        }
        return R.ok();
    }
}
