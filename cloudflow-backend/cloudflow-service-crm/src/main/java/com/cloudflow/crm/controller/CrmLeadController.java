package com.cloudflow.crm.controller;

import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.crm.domain.CrmLead;
import com.cloudflow.crm.domain.dto.CrmLeadConvertDTO;
import com.cloudflow.crm.service.ICrmLeadService;
import lombok.RequiredArgsConstructor;
import cn.dev33.satoken.annotation.SaCheckLogin;
import cn.dev33.satoken.annotation.SaCheckPermission;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/lead")
@SaCheckLogin
@RequiredArgsConstructor
public class CrmLeadController {

    private final ICrmLeadService crmLeadService;

    @GetMapping("/list")
    @SaCheckPermission("crm:lead:list")
    public R<PageResult<CrmLead>> list(CrmLead query, PageQuery pageQuery) {
        return R.ok(crmLeadService.queryPage(query, pageQuery));
    }

    @GetMapping("/{id}")
    @SaCheckPermission("crm:lead:list")
    public R<CrmLead> getInfo(@PathVariable("id") Long id) {
        CrmLead lead = crmLeadService.getById(id);
        return lead == null || !Integer.valueOf(0).equals(lead.getDeleted()) ? R.fail("线索不存在") : R.ok(lead);
    }

    @SysLog("新增CRM线索")
    // M0-8: 防重复提交
    @RepeatSubmit
    @PostMapping
    @SaCheckPermission("crm:lead:add")
    public R<Void> add(@RequestBody CrmLead lead) {
        try {
            return R.result(crmLeadService.createLead(lead));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("修改CRM线索")
    @PutMapping
    @SaCheckPermission("crm:lead:edit")
    public R<Void> edit(@RequestBody CrmLead lead) {
        try {
            return R.result(crmLeadService.updateLead(lead));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("CRM线索转客户")
    // M0-8: 防重复提交
    @RepeatSubmit
    @PostMapping("/convert")
    @SaCheckPermission("crm:lead:convert")
    public R<Long> convert(@RequestBody CrmLeadConvertDTO request) {
        try {
            return R.ok(crmLeadService.convertLead(request));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("删除CRM线索")
    @DeleteMapping("/{ids}")
    @SaCheckPermission("crm:lead:remove")
    public R<Void> remove(@PathVariable("ids") List<Long> ids) {
        for (Long id : ids) {
            CrmLead lead = new CrmLead();
            lead.setLeadId(id);
            lead.setDeleted(1);
            crmLeadService.updateById(lead);
        }
        return R.ok();
    }
}
