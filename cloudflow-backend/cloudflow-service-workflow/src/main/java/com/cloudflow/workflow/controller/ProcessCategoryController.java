package com.cloudflow.workflow.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.workflow.domain.WfProcessCategory;
import com.cloudflow.workflow.service.IProcessCategoryService;
import lombok.RequiredArgsConstructor;
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

    private final IProcessCategoryService categoryService;

    /** 查询分类树形列表（仅正常状态） */
    @GetMapping("/tree")
    public R<List<WfProcessCategory>> tree() {
        return R.ok(categoryService.listCategoryTree());
    }

    /** 查询所有分类（平铺，含停用） */
    @GetMapping("/list")
    public R<List<WfProcessCategory>> list() {
        return R.ok(categoryService.listAll());
    }

    /** 查询分类详情 */
    @GetMapping("/{categoryId}")
    public R<WfProcessCategory> getInfo(@PathVariable Long categoryId) {
        return R.ok(categoryService.getById(categoryId));
    }

    /** 新增分类 */
    @PostMapping
    public R<Void> add(@RequestBody WfProcessCategory category) {
        categoryService.add(category);
        return R.ok();
    }

    /** 修改分类 */
    @PutMapping
    public R<Void> edit(@RequestBody WfProcessCategory category) {
        categoryService.update(category);
        return R.ok();
    }

    /** 删除分类 */
    @DeleteMapping("/{categoryId}")
    public R<Void> remove(@PathVariable Long categoryId) {
        categoryService.delete(categoryId);
        return R.ok();
    }
}
