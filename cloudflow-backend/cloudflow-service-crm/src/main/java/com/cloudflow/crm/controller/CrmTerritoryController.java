package com.cloudflow.crm.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.crm.domain.CrmTerritory;
import com.cloudflow.crm.service.impl.CrmTerritoryService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/territory")
@RequiredArgsConstructor
public class CrmTerritoryController {
    private final CrmTerritoryService service;
    @GetMapping("/tree")
    @SaCheckPermission("crm:territory:list")
    public R<List<CrmTerritory>> list(@RequestParam(required = false) Long parentId) { return R.ok(service.list(parentId)); }
    @SysLog("保存销售区域")
    @PostMapping
    @RepeatSubmit
    @SaCheckPermission("crm:territory:edit")
    public R<CrmTerritory> save(@RequestBody CrmTerritory node) { return R.ok(service.save(node)); }
    @SysLog("删除销售区域")
    @DeleteMapping("/{id}")
    @SaCheckPermission("crm:territory:remove")
    public R<Void> delete(@PathVariable Long id) { service.delete(id); return R.ok(); }
}
