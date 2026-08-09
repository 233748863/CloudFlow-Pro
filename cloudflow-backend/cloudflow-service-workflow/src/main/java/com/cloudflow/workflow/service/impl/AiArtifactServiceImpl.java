package com.cloudflow.workflow.service.impl;

import com.cloudflow.workflow.config.properties.AiProperties;
import com.cloudflow.workflow.domain.dto.AiArtifactRequest;
import com.cloudflow.workflow.service.IAiArtifactService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.hc.client5.http.classic.methods.HttpPost;
import org.apache.hc.client5.http.config.RequestConfig;
import org.apache.hc.client5.http.impl.classic.CloseableHttpClient;
import org.apache.hc.client5.http.impl.classic.HttpClients;
import org.apache.hc.core5.http.ContentType;
import org.apache.hc.core5.http.HttpEntity;
import org.apache.hc.core5.http.io.HttpClientResponseHandler;
import org.apache.hc.core5.http.io.entity.EntityUtils;
import org.apache.hc.core5.http.io.entity.StringEntity;
import org.apache.hc.core5.util.Timeout;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * AI 产物生成服务实现
 * <p>
 * 密钥只在服务端持有，前端仅提交工作流定义与产物类型。
 *
 * @author CloudFlow
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AiArtifactServiceImpl implements IAiArtifactService {

    private static final String TYPE_SQL = "SQL";
    private static final String TYPE_NACOS_CONFIG = "NACOS_CONFIG";
    private static final String TYPE_JAVA_ENGINE = "JAVA_ENGINE";

    private final AiProperties aiProperties;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public String generateBackendArtifacts(AiArtifactRequest request) {
        AiProperties.Gemini gemini = aiProperties.getGemini();
        if (!aiProperties.isEnabled() || !StringUtils.hasText(gemini.getApiKey())) {
            throw new IllegalStateException("AI 能力未启用或未配置密钥，请联系管理员在服务端配置 GEMINI_API_KEY");
        }

        String artifactType = request.getArtifactType() == null
            ? ""
            : request.getArtifactType().trim().toUpperCase();
        String workflowJson = writeWorkflowJson(request.getWorkflow());
        String workflowKey = readWorkflowKey(request.getWorkflow());
        String prompt = buildPrompt(artifactType, workflowJson, workflowKey);

        String responseBody = callGemini(gemini, prompt);
        return extractText(responseBody);
    }

    /**
     * 将工作流定义序列化为便于 AI 阅读的缩进 JSON
     */
    private String writeWorkflowJson(Map<String, Object> workflow) {
        try {
            return objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(workflow);
        } catch (Exception e) {
            throw new IllegalArgumentException("工作流定义序列化失败: " + e.getMessage(), e);
        }
    }

    /**
     * 读取工作流 key，用于生成表名与服务名
     */
    private String readWorkflowKey(Map<String, Object> workflow) {
        Object key = workflow == null ? null : workflow.get("key");
        String text = key == null ? "" : String.valueOf(key).trim();
        if (!StringUtils.hasText(text)) {
            throw new IllegalArgumentException("工作流定义缺少 key 字段");
        }
        // 仅允许下划线与字母数字，避免注入到 prompt 后污染生成的表名/服务名
        if (!text.matches("[A-Za-z0-9_]{1,64}")) {
            throw new IllegalArgumentException("工作流 key 只允许字母、数字与下划线，且长度不超过 64");
        }
        return text;
    }

    /**
     * 构造各产物类型的 prompt（原先在前端 geminiService.ts 内，现收敛到服务端）
     */
    private String buildPrompt(String artifactType, String workflowJson, String workflowKey) {
        switch (artifactType) {
            case TYPE_SQL:
                return """
                    您是一名高级数据库架构师。请根据提供的 JSON 工作流定义，生成 Spring Cloud 项目所需的 MySQL 8.0 初始化脚本。

                    **输入数据 (JSON):**
                    %s

                    **要求：**
                    1. **动态表单支持**：生成 sys_form_def (表单定义) 和 sys_form_data (表单实例数据, JSON格式) 表。
                    2. **组织架构**：生成 sys_dept, sys_post, sys_user_dept 关联表，支持树状结构。
                    3. **核心工作流表**：wf_process_instance, wf_task, wf_task_log。
                    4. **委托与转办**：生成 wf_delegation 表 (owner_id, delegate_id, start_time, end_time)。
                    5. **SLA支持**：wf_task 表需包含 due_date (截止时间) 字段。
                    6. **表名生成**：根据 key='%s' 生成主业务表 (例如 biz_%s)。
                    7. **全中文注释**。

                    仅输出 SQL 代码块。
                    """.formatted(workflowJson, workflowKey, workflowKey);
            case TYPE_NACOS_CONFIG:
                return """
                    您是一名 DevOps 工程师。生成 Nacos 配置文件。

                    **要求：**
                    1. Service Name: workflow-service-%s
                    2. Nacos & Mysql 配置。
                    3. **Redis 配置 (重点)**: 配置 Spring Data Redis，启用 Keyspace Notifications 或 Pub/Sub (Topic: cloudflow.event.task)。
                    4. 增加 Spring Task Scheduler 配置，用于处理 SLA 超时扫描。

                    仅输出 YAML 代码块。
                    """.formatted(workflowKey);
            case TYPE_JAVA_ENGINE:
                return """
                    您是一名资深 Java 架构师。请编写 Spring Boot 业务逻辑代码，重点实现 **Redis Pub/Sub** 和 **SLA 超时处理**。

                    **输入工作流 (JSON):**
                    %s

                    **代码结构要求：**
                    1. **WorkflowServiceImpl.java**:
                       - 创建任务时，根据节点 SLA 配置计算 due_time。
                       - 使用 RedisTemplate.convertAndSend("task.events", event) 发送 "TASK_CREATED" 事件。
                    2. **RedisListenerConfig.java**: 配置 RedisMessageListenerContainer。
                    3. **TaskEventListener.java**:
                       - 监听 "task.events"。收到消息后，如果配置了超时，将任务ID和截止时间放入 Redis ZSet (延迟队列)。
                       - 或者监听 Redis Key 过期事件来实现超时触发。
                    4. **SLAJob.java**: 定时任务或 Redis 监听器，发现超时任务后，执行 'AUTO_PASS' 或 'AUTO_REJECT'。
                    5. **DelegationService**: 检查当前审批人是否有有效委托，如果有，自动将任务转给受托人。
                    6. **DynamicForm**: 解析 JSON 表单数据并存储。

                    请将以上类合并在一个代码块中展示（用注释分隔），并添加详细中文注释解释 Redis Pub/Sub 的用法。

                    仅输出 Java 代码块。
                    """.formatted(workflowJson);
            default:
                throw new IllegalArgumentException("不支持的产物类型: " + artifactType);
        }
    }

    /**
     * 调用 Gemini generateContent 接口，密钥通过请求头传递，避免出现在 URL 与访问日志中
     */
    private String callGemini(AiProperties.Gemini gemini, String prompt) {
        String url = "%s/models/%s:generateContent".formatted(
            gemini.getBaseUrl().replaceAll("/+$", ""), gemini.getModel());

        RequestConfig requestConfig = RequestConfig.custom()
            .setResponseTimeout(Timeout.ofSeconds(gemini.getTimeoutSeconds()))
            .setConnectionRequestTimeout(Timeout.ofSeconds(gemini.getTimeoutSeconds()))
            .build();

        try (CloseableHttpClient httpClient = HttpClients.custom()
            .setDefaultRequestConfig(requestConfig)
            .build()) {

            HttpPost httpPost = new HttpPost(url);
            httpPost.setHeader("x-goog-api-key", gemini.getApiKey());
            httpPost.setEntity(new StringEntity(buildRequestBody(prompt), ContentType.APPLICATION_JSON));

            HttpClientResponseHandler<String> handler = response -> {
                int statusCode = response.getCode();
                HttpEntity entity = response.getEntity();
                String body = entity == null ? "" : EntityUtils.toString(entity);
                if (statusCode < 200 || statusCode >= 300) {
                    // 不记录响应全文，避免上游把请求内容回显到日志
                    log.error("[callGemini] Gemini 接口返回异常, statusCode={}", statusCode);
                    throw new IllegalStateException("AI 服务返回异常，状态码 " + statusCode);
                }
                return body;
            };

            return httpClient.execute(httpPost, handler);
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            log.error("[callGemini] 调用 Gemini 失败: {}", e.getMessage(), e);
            throw new IllegalStateException("调用 AI 服务失败: " + e.getMessage(), e);
        }
    }

    /**
     * 构造 generateContent 请求体
     */
    private String buildRequestBody(String prompt) {
        Map<String, Object> part = new LinkedHashMap<>();
        part.put("text", prompt);
        Map<String, Object> content = new LinkedHashMap<>();
        content.put("parts", List.of(part));
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("contents", List.of(content));
        try {
            return objectMapper.writeValueAsString(body);
        } catch (Exception e) {
            throw new IllegalStateException("构造 AI 请求体失败: " + e.getMessage(), e);
        }
    }

    /**
     * 从 generateContent 响应中取出文本
     */
    private String extractText(String responseBody) {
        try {
            JsonNode root = objectMapper.readTree(responseBody);
            JsonNode parts = root.path("candidates").path(0).path("content").path("parts");
            StringBuilder sb = new StringBuilder();
            for (JsonNode part : parts) {
                String text = part.path("text").asText("");
                if (StringUtils.hasText(text)) {
                    sb.append(text);
                }
            }
            String text = sb.toString();
            if (!StringUtils.hasText(text)) {
                throw new IllegalStateException("AI 服务未返回有效内容");
            }
            return text;
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            log.error("[extractText] 解析 AI 响应失败: {}", e.getMessage(), e);
            throw new IllegalStateException("解析 AI 响应失败: " + e.getMessage(), e);
        }
    }



}
