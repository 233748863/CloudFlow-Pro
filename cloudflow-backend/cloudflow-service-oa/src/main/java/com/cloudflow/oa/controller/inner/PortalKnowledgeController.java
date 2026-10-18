package com.cloudflow.oa.controller.inner;

import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.PortalKnowledgeVO;
import com.cloudflow.common.core.domain.PortalKnowledgeFile;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.security.annotation.Inner;
import com.cloudflow.common.security.portal.PortalTokens;
import com.cloudflow.oa.service.impl.PortalKnowledgeService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/inner/oa/portal/knowledge")
public class PortalKnowledgeController {
    private final PortalKnowledgeService knowledge;

    @Inner(allowedServices = "cloudflow-auth")
    @GetMapping("/list")
    public R<PageResult<PortalKnowledgeVO>> list(@RequestHeader(PortalTokens.HEADER) String token,
            @RequestParam(required = false) String keyword, @RequestParam(defaultValue = "1") int pageNum,
            @RequestParam(defaultValue = "10") int pageSize) {
        return R.ok(knowledge.list(token, keyword, pageNum, pageSize));
    }

    @Inner(allowedServices = "cloudflow-auth")
    @GetMapping("/{id}")
    public R<PortalKnowledgeVO> detail(@RequestHeader(PortalTokens.HEADER) String token, @PathVariable Long id) {
        return R.ok(knowledge.detail(token, id));
    }

    @Inner(allowedServices = "cloudflow-auth")
    @GetMapping("/{id}/files/{fileId}")
    public R<PortalKnowledgeFile> file(@RequestHeader(PortalTokens.HEADER) String token, @PathVariable Long id,
            @PathVariable Long fileId, @RequestParam Long versionId) {
        return R.ok(knowledge.file(token, id, versionId, fileId));
    }
}
