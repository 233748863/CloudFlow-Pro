package cn.joywon.poco.knowledge.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/**
 * AI 返回的信息
 *
 * @author poco
 * @date 2024/5/28
 */
@Data
public class AiMessageResultDTO {

    /**
     * 返回消息的内容
     */
    String message;
    /**
     * 推理内容
     */
    String reasoningContent;
    /**
     * 资源链接
     */
    List<ExtLink> extLinks = new ArrayList<>();
    /**
     * 路径
     */
    String path;
    /**
     * 图表id
     */
    String chartId;
    /**
     * 图表类型
     */
    String chartType;
    /**
     * 是否结束
     */
    boolean finish;

    public AiMessageResultDTO() {
    }

    public AiMessageResultDTO(String message) {
        this.message = message;
    }

    public AiMessageResultDTO(String message, String path) {
        this.message = message;
        this.path = path;
    }

    public AiMessageResultDTO(String message, List<ExtLink> extLinks) {
        this.message = message;
        this.extLinks = extLinks;
    }

    /**
     * 扩展资源类型
     */
    @Data
    @AllArgsConstructor
    public static class ExtLink {

        /**
         * 资源名称
         */
        private String name;

        /**
         * 资源链接
         */
        private String url;

        /**
         * 距离
         */
        private Float distance;

        @Override
        public boolean equals(Object o) {
            if (this == o)
                return true;
            if (!(o instanceof ExtLink extLink))
                return false;
            return Objects.equals(url, extLink.url);
        }

        @Override
        public int hashCode() {
            return Objects.hashCode(url);
        }

    }

}
