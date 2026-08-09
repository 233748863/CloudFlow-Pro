package com.cloudflow.workflow.config.properties;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.cloud.context.config.annotation.RefreshScope;
import org.springframework.stereotype.Component;

/**
 * AI 能力配置属性
 * <p>
 * 密钥只允许通过环境变量或 Nacos 下发，禁止写入代码或前端产物。
 * 对应配置键前缀：cloudflow.ai
 *
 * @author CloudFlow
 */
@Data
@Component
@RefreshScope
@ConfigurationProperties(prefix = "cloudflow.ai")
public class AiProperties {

    /**
     * 是否启用 AI 能力，未配置密钥时应保持关闭
     */
    private boolean enabled = false;

    /**
     * Gemini 相关配置
     */
    private Gemini gemini = new Gemini();

    @Data
    public static class Gemini {

        /**
         * API 密钥，仅从环境变量 GEMINI_API_KEY 注入
         */
        private String apiKey;

        /**
         * 模型名称
         */
        private String model = "gemini-2.5-flash";

        /**
         * API 基础地址
         */
        private String baseUrl = "https://generativelanguage.googleapis.com/v1beta";

        /**
         * 请求超时时间（秒）
         */
        private int timeoutSeconds = 60;
    }
}
