package com.cloudflow.crm.controller;

import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.crm.domain.CrmLead;
import com.cloudflow.crm.domain.dto.CrmLeadConvertDTO;
import com.cloudflow.crm.service.ICrmLeadService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/lead")
@RequiredArgsConstructor
public class CrmLeadController {

    private final ICrmLeadService leadService;

    @GetMapping("/list")
    public R<PageResult<CrmLead>> list(CrmLead query, PageQuery pageQuery) {
        return R.ok(leadService.queryPage(query, pageQuery));
    }

    @GetMapping("/{id}")
    public R<CrmLead> getInfo(@PathVariable("id") Long id) {
        CrmLead lead = leadService.getById(id);
        return lead == null || !"0".equals(lead.getDelFlag()) ? R.fail("线索不存在") : R.ok(lead);
    }

    @SysLog("新增CRM线索")
    @PostMapping
    public R<Void> add(@RequestBody CrmLead lead) {
        try {
            return R.result(leadService.createLead(lead));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("修改CRM线索")
    @PutMapping
    public R<Void> edit(@RequestBody CrmLead lead) {
        try {
            return R.result(leadService.updateLead(lead));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("CRM线索转客户")
    @PostMapping("/convert")
    public R<Long> convert(@RequestBody CrmLeadConvertDTO request) {
        try {
            return R.ok(leadService.convertLead(request));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("删除CRM线索")
    @DeleteMapping("/{ids}")
    public R<Void> remove(@PathVariable("ids") List<Long> ids) {
        for (Long id : ids) {
            CrmLead lead = new CrmLead();
            lead.setLeadId(id);
            lead.setDelFlag("1");
            leadService.updateById(lead);
        }
        return R.ok();
    }
}
