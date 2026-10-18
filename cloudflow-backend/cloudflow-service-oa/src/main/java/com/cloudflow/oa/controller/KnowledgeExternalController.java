package com.cloudflow.oa.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.oa.domain.dto.KnowledgeExternalRequests;
import com.cloudflow.oa.domain.vo.knowledge.KnowledgeExternalStateVO;
import com.cloudflow.oa.service.impl.KnowledgeExternalService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/knowledge")
@RequiredArgsConstructor
public class KnowledgeExternalController {
    private final KnowledgeExternalService knowledge;

    @GetMapping("/{id}/external-preview")
    @SaCheckPermission("oa:knowledge:external-publish")
    public R<KnowledgeExternalStateVO> preview(@PathVariable Long id, @RequestParam(required = false) Long versionId) {
        return R.ok(knowledge.preview(id, versionId));
    }

    @PostMapping("/{id}/external-publish")
    @SaCheckPermission("oa:knowledge:external-publish")
    @RepeatSubmit.Disabled
    @SysLog("对外发布知识版本")
    public R<KnowledgeExternalStateVO> publish(@PathVariable Long id, @Valid @RequestBody KnowledgeExternalRequests.Publish request) {
        return R.ok(knowledge.publish(id, request));
    }

    @PostMapping("/{id}/external-withdraw")
    @SaCheckPermission("oa:knowledge:external-publish")
    @RepeatSubmit.Disabled
    @SysLog("撤回对外知识版本")
    public R<KnowledgeExternalStateVO> withdraw(@PathVariable Long id, @Valid @RequestBody KnowledgeExternalRequests.Version request) {
        return R.ok(knowledge.withdraw(id, request));
    }
}
