package com.cloudflow.workflow.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.workflow.domain.WfProcessDefinition;
import com.cloudflow.workflow.domain.dto.CategoryTreeNode;
import com.cloudflow.workflow.domain.dto.CreateFromTemplateRequest;
import com.cloudflow.workflow.domain.dto.CreateTemplateRequest;
import com.cloudflow.workflow.domain.dto.TemplateDTO;
import com.cloudflow.workflow.domain.dto.UpdateTemplateRequest;
import com.cloudflow.workflow.service.ITemplateCategoryService;
import com.cloudflow.workflow.service.ITemplateService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 流程模板控制器
 * 提供模板管理的 REST API
 *
 * @author CloudFlow
 */
@Slf4j
@RestController
@RequestMapping("/api/workflow/templates")
public class TemplateController {

    @Autowired
    private ITemplateService templateService;

    @Autowired
    private ITemplateCategoryService categoryService;

    /**
     * 查询模板列表（支持分页和筛选）
     * 
     * @param categoryId 分类ID（可选）
     * @param tags 标签列表（可选，逗号分隔）
     * @param keyword 关键词（可选）
     * @param pageNum 页码（默认1）
     * @param pageSize 每页大小（默认10）
     * @return 模板列表
     */
    @GetMapping
    public R<Page<TemplateDTO>> listTemplates(
            @RequestParam(required = false) String categoryId,
            @RequestParam(required = false) String tags,
            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "1") int pageNum,
            @RequestParam(defaultValue = "10") int pageSize) {
        
        log.info("查询模板列表 - 分类:{}, 标签:{}, 关键词:{}", categoryId, tags, keyword);
        
        try {
            // 解析标签（逗号分隔）
            List<String> tagList = null;
            if (tags != null && !tags.isEmpty()) {
                tagList = List.of(tags.split(","));
            }
            
            Page<TemplateDTO> result = templateService.listTemplates(
                    categoryId, tagList, keyword, pageNum, pageSize);
            
            return R.ok(result);
        } catch (Exception e) {
            log.error("查询模板列表失败", e);
            return R.fail("查询模板列表失败: " + e.getMessage());
        }
    }

    /**
     * 获取模板详情
     * 
     * @param id 模板ID
     * @return 模板详情
     */
    @GetMapping("/{id}")
    public R<TemplateDTO> getTemplate(@PathVariable String id) {
        log.info("获取模板详情 - ID:{}", id);
        
        try {
            TemplateDTO template = templateService.getTemplateById(id);
            return R.ok(template);
        } catch (Exception e) {
            log.error("获取模板详情失败", e);
            return R.fail("获取模板详情失败: " + e.getMessage());
        }
    }

    /**
     * 创建模板（管理员权限）
     * 
     * @param request 创建请求
     * @return 创建的模板
     */
    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    public R<TemplateDTO> createTemplate(@RequestBody CreateTemplateRequest request) {
        log.info("创建模板 - 名称:{}", request.getName());
        
        try {
            TemplateDTO template = templateService.createTemplate(request);
            return R.ok(template);
        } catch (Exception e) {
            log.error("创建模板失败", e);
            return R.fail("创建模板失败: " + e.getMessage());
        }
    }

    /**
     * 更新模板（管理员权限）
     * 
     * @param id 模板ID
     * @param request 更新请求
     * @return 更新后的模板
     */
    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public R<TemplateDTO> updateTemplate(
            @PathVariable String id,
            @RequestBody UpdateTemplateRequest request) {
        
        log.info("更新模板 - ID:{}", id);
        
        try {
            TemplateDTO template = templateService.updateTemplate(id, request);
            return R.ok(template);
        } catch (Exception e) {
            log.error("更新模板失败", e);
            return R.fail("更新模板失败: " + e.getMessage());
        }
    }

    /**
     * 删除模板（管理员权限）
     * 
     * @param id 模板ID
     * @return 操作结果
     */
    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public R<Void> deleteTemplate(@PathVariable String id) {
        log.info("删除模板 - ID:{}", id);
        
        try {
            templateService.deleteTemplate(id);
            return R.ok();
        } catch (Exception e) {
            log.error("删除模板失败", e);
            return R.fail("删除模板失败: " + e.getMessage());
        }
    }

    /**
     * 从模板创建流程
     * 
     * @param id 模板ID
     * @param request 创建请求
     * @return 创建的流程定义
     */
    @PostMapping("/{id}/create-workflow")
    public R<WfProcessDefinition> createWorkflowFromTemplate(
            @PathVariable String id,
            @RequestBody CreateFromTemplateRequest request) {
        
        log.info("从模板创建流程 - 模板ID:{}, 流程名称:{}", id, request.getWorkflowName());
        
        try {
            WfProcessDefinition workflow = templateService.createWorkflowFromTemplate(id, request);
            return R.ok(workflow);
        } catch (Exception e) {
            log.error("从模板创建流程失败", e);
            return R.fail("创建流程失败: " + e.getMessage());
        }
    }

    /**
     * 获取模板分类树
     * 
     * @return 分类树
     */
    @GetMapping("/categories")
    public R<List<CategoryTreeNode>> getCategories() {
        log.info("获取模板分类树");
        
        try {
            List<CategoryTreeNode> categories = categoryService.listCategoryTree();
            return R.ok(categories);
        } catch (Exception e) {
            log.error("获取分类树失败", e);
            return R.fail("获取分类树失败: " + e.getMessage());
        }
    }
}
