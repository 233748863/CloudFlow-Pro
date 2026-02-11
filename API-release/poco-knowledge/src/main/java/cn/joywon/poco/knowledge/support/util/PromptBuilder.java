package cn.joywon.poco.knowledge.support.util;

import cn.hutool.core.date.DateUtil;
import org.springframework.ai.chat.prompt.PromptTemplate;
import org.springframework.core.io.ClassPathResource;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static cn.joywon.poco.knowledge.support.constant.AiPromptField.systemTime;

/**
 * PromptTemplate 构造器
 *
 * @author poco
 * @date 2024/9/27
 */
public class PromptBuilder {

    /**
     * 渲染
     *
     * @param promptName 提示名称
     * @return {@link PromptTemplate }
     */
    public static String render(String promptName, Map<String, Object> model) {
        ClassPathResource classPathResource = new ClassPathResource("prompts/" + promptName);
        PromptTemplate promptTemplate = new PromptTemplate(classPathResource);
        return promptTemplate.render(model);
    }

    /**
     * 呈现
     *
     * @param promptName 提示名称
     * @return {@link String }
     */
    public static String render(String promptName) {
        return render(promptName, Map.of(systemTime, DateUtil.now()));
    }


    /**
     * Markdown渲染表格
     *
     * @param list 列表
     * @return {@link String }
     */
    public static String toMarkdownTable(List<Map<String, Object>> list) {
        if (list == null || list.isEmpty()) return "";

        // 获取表头（第一行的KeySet）
        Set<String> headers = list.get(0).keySet();

        // 构建表头
        StringBuilder sb = new StringBuilder();
        sb.append("| ").append(String.join(" | ", headers)).append(" |\n");
        sb.append("|").append(" --- |".repeat(headers.size())).append("\n");

        // 构建表内容
        for (Map<String, Object> row : list) {
            sb.append("| ");
            for (String header : headers) {
                sb.append(row.getOrDefault(header, "")).append(" | ");
            }
            sb.append("\n");
        }

        return sb.toString();
    }
}
