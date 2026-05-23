package com.cloudflow.oa.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.oa.domain.OaContractTemplate;
import com.cloudflow.oa.service.IOaContractTemplateService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * OA-P0-2 合同模板 REST 接口。
 */
@RestController
@RequestMapping("/contract/template")
@RequiredArgsConstructor
public class OaContractTemplateController {

    private final IOaContractTemplateService templateService;

    @GetMapping("/page")
    @SaCheckPermission("oa:contract:template:list")
    public R<Page<OaContractTemplate>> page(@RequestParam(required = false) String keyword,
                                            @RequestParam(required = false) String category,
                                            @RequestParam(required = false) String status,
                                            @RequestParam(defaultValue = "1") Integer pageNum,
                                            @RequestParam(defaultValue = "10") Integer pageSize) {
        return R.ok(templateService.page(keyword, category, status, pageNum, pageSize));
    }

    @GetMapping("/active")
    @SaCheckPermission("oa:contract:add")
    public R<List<OaContractTemplate>> listActive(@RequestParam(required = false) String category) {
        return R.ok(templateService.listActive(category));
    }

    @GetMapping("/{id}")
    @SaCheckPermission("oa:contract:template:list")
    public R<OaContractTemplate> getInfo(@PathVariable("id") Long id) {
        return R.ok(templateService.getById(id));
    }

    @SysLog("新增合同模板")
    @PostMapping
    @SaCheckPermission("oa:contract:template:add")
    public R<Void> add(@RequestBody OaContractTemplate template) {
        try {
            return templateService.save(template) ? R.ok() : R.fail("新增失败");
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("修改合同模板")
    @PutMapping
    @SaCheckPermission("oa:contract:template:edit")
    public R<Void> edit(@RequestBody OaContractTemplate template) {
        try {
            return templateService.update(template) ? R.ok() : R.fail("更新失败");
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("删除合同模板")
    @DeleteMapping("/{id}")
    @SaCheckPermission("oa:contract:template:remove")
    public R<Void> remove(@PathVariable("id") Long id) {
        return templateService.remove(id) ? R.ok() : R.fail("删除失败");
    }

    @PostMapping("/{id}/render")
    @SaCheckPermission("oa:contract:add")
    public R<String> render(@PathVariable("id") Long id,
                            @RequestBody(required = false) Map<String, Object> variables) {
        return R.ok(templateService.renderContent(id, variables));
    }
}
