package cn.joywon.poco.knowledge.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;
import lombok.experimental.FieldNameConstants;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

/**
 * 交互message
 *
 * @author poco
 * @date 2024/3/20
 */
@Data
public class ChatMessageDTO implements Serializable {

    /**
     * 型号名称 (注意这里是平台内部的唯一标识名称)
     */
    private String modelName;

    /**
     * 消息key
     */
    private Long messageKey;

    /**
     * 会话ID
     */
    private String conversationId;

    /**
     * 是否是系统内部会话
     */
    private boolean isInner;

    /**
     * 对外密码
     */
    private String accessKey;

    /**
     * 历史消息3条
     */
    private Integer retrieveSize = 3;

    /**
     * 知识库ID
     */
    @NotNull
    private Long datasetId;

    /**
     * 内容
     */
    @NotBlank
    private String content;

    /**
     * 扩展信息
     * <p>
     * { "funcName": "查询", "table": { "dsName": "mysql", "tableNames": ["user"] } }
     */
    private ExtDetails extDetails;

    /**
     * 网络搜索
     */
    private boolean websearch;

    @Data
    @FieldNameConstants
    public static class ExtDetails implements Serializable {

        /**
         * 功能名称
         */
        private String funcName;

        /**
         * 数据id
         */
        private Long dataId;

        /**
         * 用户信息
         */
        private String accessToken;

        /**
         * 租户ID
         */
        private Long tenantId;

        /**
         * 文件
         */
        private List<FileDTO> files = new ArrayList();

        /**
         * 图像
         */
        private List<FileDTO> images = new ArrayList();

        /**
         * MCPid
         */
        private String mcpId;

        /**
         * 图表类型
         */
        private String chartType;

        /**
         * 图表id
         */
        private String chartId;
    }

    @Data
    public static class Table implements Serializable {

        /**
         * 数据源名称
         */
        String dsName;

        /**
         * 表名
         */
        String[] tableNames;

    }

    /**
     * 文件 DTO
     *
     * @author poco
     * @date 2025/03/20
     */
    @Data
    public static class FileDTO implements Serializable {
        /**
         * 名字
         */
        private String name;

        /**
         * 网址
         */
        private String url;
    }

}
