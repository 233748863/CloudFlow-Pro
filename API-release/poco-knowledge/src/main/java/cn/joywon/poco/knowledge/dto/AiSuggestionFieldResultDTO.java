package cn.joywon.poco.knowledge.dto;

import dev.langchain4j.model.output.structured.Description;
import lombok.Data;

import java.util.List;

/**
 * AI 建议字段信息
 *
 * @author poco
 * @date 2025/3/27
 */
@Data
@Description("数据库注释建议结果")
public class AiSuggestionFieldResultDTO {

    @Description("AI建议更准确表注释")
    String tableSuggestionComment;

    @Description("建议字段注释列表")
    List<AiSuggestionFieldDTO> suggestions;


    @Data
    @Description("字段建议")
    public static class AiSuggestionFieldDTO {
        @Description("字段名称，例如 id")
        private String fieldName;

        @Description("字段注释，例如 主键")
        private String fieldComment;

        @Description("AI建议更准确字段注释，例如 主键ID")
        private String fieldSuggestionComment;
    }
}
