package cn.joywon.poco.knowledge.support.flow.model.nodes;

import lombok.Data;

import java.util.List;

/**
 * AI 开关节点
 *
 * @author poco
 * @date 2025/03/03
 */
@Data
public class AiSwitchNode {
    /**
     * 代码内容
     */
    private String code;

    /**
     * 变量名
     */
    private String variable;

    /**
     * 分支列表
     */
    private List<Case> cases;

    @Data
    public static class Case {
        /**
         * 分支名
         */
        private String name;
        /**
         * 分支值
         */
        private String value;
    }
}
