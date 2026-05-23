package com.cloudflow.oa.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.oa.domain.KnowledgeDocVersion;
import com.cloudflow.oa.service.IKnowledgeVersionService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * OA-P0-1 知识库版本管理 REST 接口。
 */
@RestController
@RequestMapping("/knowledge")
@RequiredArgsConstructor
public class KnowledgeVersionController {

    private final IKnowledgeVersionService knowledgeVersionService;

    @GetMapping("/{id}/versions")
    @SaCheckPermission("oa:knowledge:list")
    public R<List<KnowledgeDocVersion>> listVersions(@PathVariable("id") Long documentId) {
        return R.ok(knowledgeVersionService.listVersions(documentId));
    }

    @GetMapping("/{id}/versions/{versionNo}")
    @SaCheckPermission("oa:knowledge:list")
    public R<KnowledgeDocVersion> getVersion(@PathVariable("id") Long documentId,
                                             @PathVariable("versionNo") Integer versionNo) {
        KnowledgeDocVersion version = knowledgeVersionService.getVersion(documentId, versionNo);
        if (version == null) {
            return R.fail("指定版本不存在");
        }
        return R.ok(version);
    }

    @GetMapping("/{id}/versions/diff")
    @SaCheckPermission("oa:knowledge:list")
    public R<Map<String, Object>> diff(@PathVariable("id") Long documentId,
                                       @RequestParam("from") Integer fromVersion,
                                       @RequestParam("to") Integer toVersion) {
        try {
            return R.ok(knowledgeVersionService.diff(documentId, fromVersion, toVersion));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("回滚知识库文档到历史版本")
    @PostMapping("/{id}/versions/{versionNo}/rollback")
    @SaCheckPermission("oa:knowledge:edit")
    public R<Void> rollback(@PathVariable("id") Long documentId,
                            @PathVariable("versionNo") Integer versionNo) {
        try {
            return knowledgeVersionService.rollback(documentId, versionNo) ? R.ok() : R.fail("回滚失败");
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }
}
