package cn.joywon.poco.knowledge.config.properties;

import lombok.Data;
import org.springframework.ai.chat.client.advisor.AbstractChatMemoryAdvisor;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.NestedConfigurationProperty;
import org.springframework.cloud.context.config.annotation.RefreshScope;

/**
 * @author poco
 * @date 2024/3/26
 * <p>
 * AI 知识库配置
 */
@Data
@RefreshScope
@ConfigurationProperties("pig.ai")
public class AiKnowledgeProperties {

    /**
     * 是否启用
     */
    private boolean enabled;

    /**
     * 是否显示日志
     */
    private boolean showLog;

    /**
     * 最大重试次数
     */
    private int maxRetry = 1;

    /**
     * 连接超时时间
     */
    private int connectTimeout = 100;

    /**
     * 读取超时时间
     */
    private int readTimeout = 100;

    /**
     * 默认会话ID
     */
    String defaultConversationId = AbstractChatMemoryAdvisor.DEFAULT_CHAT_MEMORY_CONVERSATION_ID;

    /**
     * 默认会话窗口大小
     */
    int chatHistoryWindowSize = 5;

    /**
     * 总结内容最大长度
     */
    private Integer maxSummary = 3000;

    /**
     * 后缀
     */
    private String suffixPrompt;

    /**
     * CNOCR
     */
    @NestedConfigurationProperty
    private CnOCRProperties cnocr = new CnOCRProperties();

    /**
     * 风险控制
     */
    @NestedConfigurationProperty
    private RiskControlProperties riskControl;

    /**
     * unstructured 解析配置
     */
    @NestedConfigurationProperty
    private UnstructuredProperties unstructured;

    /**
     * Siliconflow 图像
     */
    @NestedConfigurationProperty
    private SiliconflowProperties silicon;

    /**
     * VolcEngine TTS
     */
    @NestedConfigurationProperty
    private VolcengineTtsProperties volcengineTts;

    /**
     * Gitee 配置
     */
    @NestedConfigurationProperty
    GiteeIssueApiProperties gitee = new GiteeIssueApiProperties();

    /**
     * 连接
     */
    @NestedConfigurationProperty
    private AiConnectionProperties connection = new AiConnectionProperties();

    /**
     * 默认模型
     */
    @NestedConfigurationProperty
    private DefaultModelProperties defaultModel = new DefaultModelProperties();

    /**
     * 小米物联
     */
    @NestedConfigurationProperty
    private MiIotProperties miIot = new MiIotProperties();

    /**
     * markitdown 服务地址
     */
    @NestedConfigurationProperty
    private Office2MdProperties markitdown = new Office2MdProperties();

    /**
     * 网络搜索
     */
    @NestedConfigurationProperty
    private WebSearchProperties webSearch = new WebSearchProperties();

    /**
     * 视觉
     */
    @NestedConfigurationProperty
    private AiVisionProperties vision = new AiVisionProperties();

    /**
     * 全文搜索
     */
    @NestedConfigurationProperty
    private FullTextSearchProperties fullTextSearch = new FullTextSearchProperties();

    /**
     * 简单内存搜索
     */
    @NestedConfigurationProperty
    private SimpleInMemorySearchProperties inMemorySearch = new SimpleInMemorySearchProperties();
}
