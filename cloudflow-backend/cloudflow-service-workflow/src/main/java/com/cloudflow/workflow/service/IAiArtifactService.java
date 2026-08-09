package com.cloudflow.workflow.service;

import com.cloudflow.workflow.domain.dto.AiArtifactRequest;

/**
 * AI 产物生成服务
 * <p>
 * 承接原先在前端直连 Gemini 的逻辑，密钥与 prompt 构造全部收敛到服务端。
 *
 * @author CloudFlow
 */
public interface IAiArtifactService {

    /**
     * 根据工作流定义生成后端产物（SQL / Nacos 配置 / Java 代码）
     *
     * @param request 生成请求
     * @return 生成的文本内容
     */
    String generateBackendArtifacts(AiArtifactRequest request);
}
