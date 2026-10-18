package com.cloudflow.crm.controller;

import cn.dev33.satoken.annotation.SaCheckLogin;
import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.crm.domain.CrmSalesTarget;
import com.cloudflow.crm.domain.dto.CrmSalesTargetWriteDTO;
import com.cloudflow.crm.domain.vo.CrmSalesTargetPreviewVO;
import com.cloudflow.crm.service.ICrmSalesTargetService;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/sales-target")
@SaCheckLogin
@RequiredArgsConstructor
public class CrmSalesTargetController {
    private final ICrmSalesTargetService crmSalesTargetService;

    @GetMapping("/list")
    @SaCheckPermission("crm:sales-target:list")
    public R<PageResult<CrmSalesTarget>> list(CrmSalesTarget query, PageQuery pageQuery) {
        return R.ok(crmSalesTargetService.queryPage(query, pageQuery));
    }

    @GetMapping("/{id}")
    @SaCheckPermission("crm:sales-target:list")
    public R<CrmSalesTarget> getInfo(@PathVariable("id") Long id) {
        return R.ok(crmSalesTargetService.detail(id));
    }

    @GetMapping("/creation/{requestKey}")
    @SaCheckPermission("crm:sales-target:list")
    public R<CrmSalesTarget> creation(@PathVariable("requestKey") String requestKey) {
        return R.ok(crmSalesTargetService.creation(requestKey));
    }

    @PostMapping("/preview")
    @SaCheckPermission("crm:sales-target:list")
    @RepeatSubmit.Disabled
    public R<CrmSalesTargetPreviewVO> preview(@RequestBody CrmSalesTargetWriteDTO request) {
        return R.ok(crmSalesTargetService.preview(request));
    }

    @SysLog("新增CRM销售目标")
    @RepeatSubmit.Disabled
    @PostMapping
    @SaCheckPermission("crm:sales-target:add")
    public R<CrmSalesTarget> add(@RequestBody CrmSalesTargetWriteDTO request) {
        return R.ok(crmSalesTargetService.createSalesTarget(request));
    }

    @SysLog("修改CRM销售目标")
    @PutMapping
    @SaCheckPermission("crm:sales-target:edit")
    public R<CrmSalesTarget> edit(@RequestBody CrmSalesTargetWriteDTO request) {
        return R.ok(crmSalesTargetService.updateSalesTarget(request));
    }

    @SysLog("删除CRM销售目标")
    @DeleteMapping("/{ids}")
    @SaCheckPermission("crm:sales-target:remove")
    public R<Void> remove(@PathVariable("ids") List<Long> ids, @RequestParam("versions") List<Integer> versions) {
        crmSalesTargetService.removeSalesTargets(ids, versions);
        return R.ok();
    }
}
