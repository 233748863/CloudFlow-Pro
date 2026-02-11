package cn.joywon.poco.knowledge.dto;

import lombok.Data;

/**
 * @author poco
 * @date 2025/3/14
 * <p>
 * *     base_url: Optional[str] = Form(None, description="自定义OpenAI API基础URL"),
 * *     api_key: Optional[str] = Form(None, description="自定义OpenAI API密钥"),
 * *     model: Optional[str] = Form(None, description="自定义OpenAI模型名称"),
 * *     prompt: Optional[str] = Form(None, description="自定义提示词"),
 * *     concurrent_limit: Optional[int] = Form(None, description="自定义PDF处理并发限制"),
 * *     batch_size: Optional[int] = Form(None, description="自定义PDF批处理大小"),
 * *     delete_delay: Optional[int] = Form(None, description="自定义文件删除延迟时间(秒)")
 */
@Data
public class AiMarkitdownDTO {

    /**
     * 自定义OpenAI API基础URL
     */
    private String base_url;

    /**
     * 自定义OpenAI API密钥
     */
    private String api_key;

    /**
     * 自定义OpenAI模型名称
     */
    private String model;

    /**
     * 自定义提示词
     */
    private String prompt;

    /**
     * 自定义PDF处理并发限制
     */
    private Integer concurrent_limit;

    /**
     * 自定义PDF批处理大小
     */
    private Integer batch_size;

    /**
     * 自定义文件删除延迟时间(秒)
     */
    private Integer delete_delay;
}
