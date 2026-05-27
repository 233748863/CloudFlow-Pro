package com.cloudflow.workflow.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.workflow.domain.WfProcessCategory;
import com.cloudflow.workflow.service.IProcessCategoryService;
import lombok.RequiredArgsConstructor;
import cn.dev33.satoken.annotation.SaCheckPermission;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 流程分类管理控制器
 *
 * @author CloudFlow
 */
@RestController
@RequestMapping("/category")
@RequiredArgsConstructor
public class ProcessCategoryController {

    private final IProcessCategoryService processCategoryService;

    /** 查询分类树形列表（仅正常状态） */
    @GetMapping("/tree")
    @SaCheckPermission("workflow:category:list")
    public R<List<WfProcessCategory>> tree() {
        return R.ok(processCategoryService.listCategoryTree());
    }

    /** 查询所有分类（平铺，含停用） */
    @GetMapping("/list")
    @SaCheckPermission("workflow:category:list")
    public R<List<WfProcessCategory>> list() {
        return R.ok(processCategoryService.listAll());
    }

    /** 查询分类详情 */
    @GetMapping("/{categoryId}")
    @SaCheckPermission("workflow:category:list")
    public R<WfProcessCategory> getInfo(@PathVariable Long categoryId) {
        return R.ok(processCategoryService.getById(categoryId));
    }

    /** 新增分类 */
    @PostMapping
    @SaCheckPermission("workflow:category:manage")
    public R<Void> add(@RequestBody WfProcessCategory category) {
        processCategoryService.add(category);
        return R.ok();
    }

    /** 修改分类 */
    @PutMapping
    @SaCheckPermission("workflow:category:manage")
    public R<Void> edit(@RequestBody WfProcessCategory category) {
        processCategoryService.update(category);
        return R.ok();
    }

    /** 删除分类 */
    @DeleteMapping("/{categoryId}")
    @SaCheckPermission("workflow:category:manage")
    public R<Void> remove(@PathVariable Long categoryId) {
        processCategoryService.delete(categoryId);
        return R.ok();
    }
}
