package com.cloudflow.workflow.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.workflow.domain.TemplateCategory;
import com.cloudflow.workflow.domain.WfProcessDefinition;
import com.cloudflow.workflow.domain.dto.CategoryTreeNode;
import com.cloudflow.workflow.domain.dto.CreateFromTemplateRequest;
import com.cloudflow.workflow.domain.dto.CreateTemplateRequest;
import com.cloudflow.workflow.domain.dto.TemplateCategoryRequest;
import com.cloudflow.workflow.domain.dto.TemplateDTO;
import com.cloudflow.workflow.domain.dto.UpdateTemplateRequest;
import com.cloudflow.workflow.service.ITemplateCategoryService;
import com.cloudflow.workflow.service.ITemplateService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 流程模板控制器
 */
@Slf4j
@RestController
@RequestMapping("/templates")
public class TemplateController {

    @Autowired
    private ITemplateService templateService;

    @Autowired
    private ITemplateCategoryService categoryService;

    @GetMapping
    public R<Page<TemplateDTO>> listTemplates(
            @RequestParam(required = false) String categoryId,
            @RequestParam(required = false) String tags,
            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "1") int pageNum,
            @RequestParam(defaultValue = "10") int pageSize) {
        try {
            List<String> tagList = null;
            if (StringUtils.hasText(tags)) {
                tagList = List.of(tags.split(","));
            }
            Page<TemplateDTO> result = templateService.listTemplates(categoryId, tagList, keyword, pageNum, pageSize);
            return R.ok(result);
        } catch (Exception e) {
            log.error("查询模板列表失败", e);
            return R.fail("查询模板列表失败: " + e.getMessage());
        }
    }

    @GetMapping("/{id}")
    public R<TemplateDTO> getTemplate(@PathVariable String id) {
        try {
            TemplateDTO template = templateService.getTemplateById(id);
            return R.ok(template);
        } catch (Exception e) {
            log.error("获取模板详情失败, templateId={}", id, e);
            return R.fail("获取模板详情失败: " + e.getMessage());
        }
    }

    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    public R<TemplateDTO> createTemplate(@RequestBody CreateTemplateRequest request) {
        try {
            TemplateDTO template = templateService.createTemplate(request);
            return R.ok(template);
        } catch (Exception e) {
            log.error("创建模板失败, templateName={}", request.getName(), e);
            return R.fail("创建模板失败: " + e.getMessage());
        }
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public R<TemplateDTO> updateTemplate(
            @PathVariable String id,
            @RequestBody UpdateTemplateRequest request) {
        try {
            TemplateDTO template = templateService.updateTemplate(id, request);
            return R.ok(template);
        } catch (Exception e) {
            log.error("更新模板失败, templateId={}", id, e);
            return R.fail("更新模板失败: " + e.getMessage());
        }
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public R<Void> deleteTemplate(@PathVariable String id) {
        try {
            templateService.deleteTemplate(id);
            return R.ok();
        } catch (Exception e) {
            log.error("删除模板失败, templateId={}", id, e);
            return R.fail("删除模板失败: " + e.getMessage());
        }
    }

    @PostMapping("/{id}/create-workflow")
    public R<WfProcessDefinition> createWorkflowFromTemplate(
            @PathVariable String id,
            @RequestBody CreateFromTemplateRequest request) {
        try {
            WfProcessDefinition workflow = templateService.createWorkflowFromTemplate(id, request);
            return R.ok(workflow);
        } catch (Exception e) {
            log.error("从模板创建流程失败, templateId={}", id, e);
            return R.fail("从模板创建流程失败: " + e.getMessage());
        }
    }

    @GetMapping("/categories")
    public R<List<CategoryTreeNode>> getCategories() {
        try {
            List<CategoryTreeNode> categories = categoryService.listCategoryTree();
            return R.ok(categories);
        } catch (Exception e) {
            log.error("查询模板分类树失败", e);
            return R.fail("查询模板分类树失败: " + e.getMessage());
        }
    }

    @GetMapping("/categories/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public R<TemplateCategory> getCategory(@PathVariable String id) {
        try {
            TemplateCategory category = categoryService.getById(id);
            return R.ok(category);
        } catch (Exception e) {
            log.error("获取模板分类详情失败, categoryId={}", id, e);
            return R.fail("获取模板分类详情失败: " + e.getMessage());
        }
    }

    @PostMapping("/categories")
    @PreAuthorize("hasRole('ADMIN')")
    public R<TemplateCategory> createCategory(@RequestBody TemplateCategoryRequest request) {
        try {
            TemplateCategory category = fillCategoryFromRequest(new TemplateCategory(), request);
            TemplateCategory saved = categoryService.add(category);
            return R.ok(saved);
        } catch (Exception e) {
            log.error("创建模板分类失败, categoryName={}", request.getName(), e);
            return R.fail("创建模板分类失败: " + e.getMessage());
        }
    }

    @PutMapping("/categories/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public R<TemplateCategory> updateCategory(
            @PathVariable String id,
            @RequestBody TemplateCategoryRequest request) {
        try {
            TemplateCategory category = categoryService.getById(id);
            fillCategoryFromRequest(category, request);
            category.setId(id);
            TemplateCategory updated = categoryService.update(category);
            return R.ok(updated);
        } catch (Exception e) {
            log.error("更新模板分类失败, categoryId={}", id, e);
            return R.fail("更新模板分类失败: " + e.getMessage());
        }
    }

    @DeleteMapping("/categories/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public R<Void> deleteCategory(@PathVariable String id) {
        try {
            categoryService.delete(id);
            return R.ok();
        } catch (Exception e) {
            log.error("删除模板分类失败, categoryId={}", id, e);
            return R.fail("删除模板分类失败: " + e.getMessage());
        }
    }

    private TemplateCategory fillCategoryFromRequest(TemplateCategory target, TemplateCategoryRequest request) {
        target.setName(StringUtils.hasText(request.getName()) ? request.getName().trim() : request.getName());
        target.setDescription(StringUtils.hasText(request.getDescription()) ? request.getDescription().trim() : request.getDescription());
        target.setParentId(StringUtils.hasText(request.getParentId()) ? request.getParentId().trim() : null);
        target.setOrderNum(request.getOrderNum() == null ? 0 : request.getOrderNum());
        return target;
    }
}
