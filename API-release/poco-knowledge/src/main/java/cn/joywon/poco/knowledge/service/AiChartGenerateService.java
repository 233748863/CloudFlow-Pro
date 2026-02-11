package cn.joywon.poco.knowledge.service;

import cn.joywon.poco.knowledge.dto.ChatMessageDTO;

/**
 * AI 图表生成
 *
 * @author poco
 * @date 2025/3/23
 */
public interface AiChartGenerateService {
    /**
     * 生成图表
     *
     * @param prompt    提示
     * @param chartType 图表类型  1. Line chart 2. Pie chart 3. Bar chart
     * @param data      数据
     */
    void generateChart(ChatMessageDTO chatMessageDTO, Object data);


    /**
     * 获取图表
     *
     * @param chartId 图表id
     * @return {@link String }
     */
    String getChart(String chartId);
}
