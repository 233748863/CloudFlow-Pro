package com.cloudflow.oa.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.web.MapConverters;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.oa.domain.vo.knowledge.KnowledgeVersionDiffVO;
import com.cloudflow.oa.domain.vo.knowledge.KnowledgeVersionVO;
import com.cloudflow.oa.service.IKnowledgeVersionService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * OA-P0-1 知识库版本管理 REST 接口。
 */
@RestController
@RequestMapping("/knowledge")
@RequiredArgsConstructor
public class KnowledgeVersionController {

    private final IKnowledgeVersionService knowledgeVersionService;
    private final ObjectMapper objectMapper;

    @GetMapping("/{id}/versions")
    @SaCheckPermission("oa:knowledge:list")
    public R<List<KnowledgeVersionVO>> listVersions(@PathVariable("id") Long documentId) {
        return R.ok(MapConverters.toVOList(knowledgeVersionService.listVersions(documentId),
                KnowledgeVersionVO.class, objectMapper));
    }

    @GetMapping("/{id}/versions/{versionNo}")
    @SaCheckPermission("oa:knowledge:list")
    public R<KnowledgeVersionVO> getVersion(@PathVariable("id") Long documentId,
                                            @PathVariable("versionNo") Integer versionNo) {
        var version = knowledgeVersionService.getVersion(documentId, versionNo);
        if (version == null) {
            return R.fail("指定版本不存在");
        }
        return R.ok(objectMapper.convertValue(version, KnowledgeVersionVO.class));
    }

    @GetMapping("/{id}/versions/diff")
    @SaCheckPermission("oa:knowledge:list")
    public R<KnowledgeVersionDiffVO> diff(@PathVariable("id") Long documentId,
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
