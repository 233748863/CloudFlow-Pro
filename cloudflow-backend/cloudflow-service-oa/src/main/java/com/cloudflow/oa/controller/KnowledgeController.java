package com.cloudflow.oa.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import cn.dev33.satoken.annotation.SaCheckPermission;
import cn.dev33.satoken.annotation.SaCheckRole;
import cn.dev33.satoken.annotation.SaMode;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.oa.domain.KnowledgeDocument;
import com.cloudflow.oa.domain.vo.DynamicMapVO;
import com.cloudflow.oa.service.IKnowledgeService;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/knowledge")
public class KnowledgeController {

    private final IKnowledgeService knowledgeService;

    public KnowledgeController(IKnowledgeService knowledgeService) {
        this.knowledgeService = knowledgeService;
    }

    @GetMapping("/my-list")
    @SaCheckPermission("oa:knowledge:list")
    public R<List<KnowledgeDocument>> getMyList(@RequestParam(required = false) String keyword,
                                                @RequestParam(required = false) String category,
                                                @RequestParam(required = false) Boolean unreadOnly) {
        return R.ok(knowledgeService.getMyReadableList(keyword, category, unreadOnly));
    }

    @GetMapping("/my-submissions")
    @SaCheckPermission("oa:knowledge:list")
    public R<Page<KnowledgeDocument>> getMySubmissions(@RequestParam(required = false) String keyword,
                                                       @RequestParam(required = false) String category,
                                                       @RequestParam(required = false) String status,
                                                       @RequestParam(defaultValue = "1") Integer pageNum,
                                                       @RequestParam(defaultValue = "10") Integer pageSize) {
        return R.ok(knowledgeService.getMySubmissions(keyword, category, status, pageNum, pageSize));
    }

    @GetMapping("/manage-list")
    @SaCheckPermission("oa:knowledge:manage")
    public R<Page<KnowledgeDocument>> getManageList(@RequestParam(required = false) String keyword,
                                                    @RequestParam(required = false) String category,
                                                    @RequestParam(required = false) String status,
                                                    @RequestParam(defaultValue = "1") Integer pageNum,
                                                    @RequestParam(defaultValue = "10") Integer pageSize) {
        return R.ok(knowledgeService.getManageList(keyword, category, status, pageNum, pageSize));
    }

    @GetMapping("/{id}")
    @SaCheckPermission("oa:knowledge:list")
    public R<KnowledgeDocument> getInfo(@PathVariable("id") Long id) {
        try {
            return R.ok(knowledgeService.getReadableDetail(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("新增知识库文档")
    @PostMapping
    @SaCheckPermission("oa:knowledge:add")
    public R<Void> add(@RequestBody KnowledgeDocument document) {
        try {
            return knowledgeService.createDraft(document) ? R.ok() : R.fail("创建失败");
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("修改知识库文档")
    @PutMapping
    @SaCheckPermission("oa:knowledge:edit")
    public R<Void> edit(@RequestBody KnowledgeDocument document) {
        try {
            return knowledgeService.updateDraft(document) ? R.ok() : R.fail("更新失败");
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("删除知识库文档")
    @DeleteMapping("/{id}")
    @SaCheckPermission("oa:knowledge:remove")
    public R<Void> remove(@PathVariable("id") Long id) {
        try {
            return knowledgeService.removeDocument(id) ? R.ok() : R.fail("删除失败");
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("提交知识库发布审批")
    @PostMapping("/submit/{id}")
    @SaCheckPermission("oa:knowledge:submit")
    public R<Void> submit(@PathVariable("id") Long id) {
        try {
            return knowledgeService.submit(id) ? R.ok() : R.fail("提交失败");
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("撤回知识库发布审批")
    @PostMapping("/recall/{id}")
    @SaCheckPermission("oa:knowledge:recall")
    public R<Void> recall(@PathVariable("id") Long id) {
        try {
            return knowledgeService.recall(id) ? R.ok() : R.fail("撤回失败");
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @PostMapping("/read/{id}")
    @SaCheckPermission("oa:knowledge:list")
    public R<Boolean> read(@PathVariable("id") Long id) {
        try {
            return R.ok(knowledgeService.read(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @GetMapping("/read-stats/{id}")
    @SaCheckPermission("oa:knowledge:manage")
    public R<DynamicMapVO> getReadStats(@PathVariable("id") Long id) {
        try {
            return R.ok(knowledgeService.getReadStats(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }
}

