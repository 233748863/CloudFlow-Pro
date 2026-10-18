package com.cloudflow.crm.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.crm.domain.dto.CrmPortalTicketCommands;
import com.cloudflow.crm.mapper.CrmPortalTicketMapper;
import com.cloudflow.crm.service.impl.CrmPortalTicketManagement;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/ticket")
@RequiredArgsConstructor
public class CrmPortalTicketManagementController {
    private final CrmPortalTicketManagement tickets;

    @GetMapping("/{id}/portal-management")
    @SaCheckPermission("crm:ticket:list")
    public R<CrmPortalTicketManagement.View> view(@PathVariable Long id) {
        return R.ok(tickets.view(id));
    }

    @GetMapping("/{id}/handlers")
    @SaCheckPermission("crm:ticket:edit")
    public R<PageResult<CrmPortalTicketMapper.Handler>> handlers(@PathVariable Long id,
            @RequestParam(required = false) String keyword, @RequestParam(defaultValue = "1") int pageNum,
            @RequestParam(defaultValue = "10") int pageSize) {
        return R.ok(tickets.handlers(id, keyword, pageNum, pageSize));
    }

    @PostMapping("/{id}/assign")
    @SaCheckPermission("crm:ticket:edit")
    @RepeatSubmit
    @SysLog("分派客户门户工单")
    public R<CrmPortalTicketManagement.View> assign(@PathVariable Long id, @Valid @RequestBody CrmPortalTicketCommands.Assignment body) {
        return R.ok(tickets.assign(id, body));
    }

    @PutMapping("/{id}/portal-solution")
    @SaCheckPermission("crm:portal:solution:publish")
    @SysLog(value = "发布或撤回客户工单方案", logParams = false)
    public R<CrmPortalTicketManagement.View> publish(@PathVariable Long id, @Valid @RequestBody CrmPortalTicketCommands.Publication body) {
        return R.ok(tickets.publish(id, body));
    }

    @GetMapping("/{id}/portal-files/{fileId}/content")
    @SaCheckPermission("crm:ticket:list")
    public void content(@PathVariable Long id, @PathVariable Long fileId, HttpServletResponse response) {
        tickets.content(id, fileId, response);
    }
}
