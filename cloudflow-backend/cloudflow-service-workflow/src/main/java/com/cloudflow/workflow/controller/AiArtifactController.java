package com.cloudflow.workflow.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.workflow.domain.dto.AiArtifactRequest;
import com.cloudflow.workflow.service.IAiArtifactService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * AI 产物生成控制器
 * <p>
 * 前端不再直连 Gemini，密钥只在服务端持有。
 *
 * @author CloudFlow
 */
@RestController
@RequestMapping("/ai")
@RequiredArgsConstructor
public class AiArtifactController {

    private final IAiArtifactService aiArtifactService;

    /** 根据工作流定义生成后端产物（SQL / Nacos 配置 / Java 代码） */
    @PostMapping("/workflow-artifacts")
    @SaCheckPermission("workflow:ai:generate")
    public R<String> generateWorkflowArtifacts(@Valid @RequestBody AiArtifactRequest request) {
        return R.ok(aiArtifactService.generateBackendArtifacts(request));
    }
}
