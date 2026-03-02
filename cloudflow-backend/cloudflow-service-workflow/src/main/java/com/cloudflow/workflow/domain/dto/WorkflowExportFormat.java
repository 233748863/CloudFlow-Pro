package com.cloudflow.workflow.domain.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * 流程导出格式规范
 * 定义流程导出的标准 JSON 格式，包含版本、导出时间、流程数据、依赖信息和校验和
 * 
 * @author CloudFlow
 */
@Data
public class WorkflowExportFormat implements Serializable {
    private static final long serialVersionUID = 1L;

    /**
     * 导出格式版本（语义化版本号，如 "1.0.0"）
     * 用于标识导出格式的版本，便于未来格式升级时的兼容性处理
     */
    private String version;

    /**
     * 导出时间
     */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime exportedAt;

    /**
     * 导出用户 ID
     */
    private String exportedBy;

    /**
     * 导出用户名称
     */
    private String exportedByName;

    /**
     * 流程数据
     */
    private WorkflowData workflow;

    /**
     * 依赖信息（可选）
     * 记录流程使用的节点类型和集成，用于导入时的兼容性检查
     */
    private DependencyInfo dependencies;

    /**
     * 文件校验和（SHA-256）
     * 用于验证文件完整性，防止文件在传输过程中被篡改
     */
    private String checksum;

    /**
     * 流程数据内部类
     */
    @Data
    public static class WorkflowData implements Serializable {
        private static final long serialVersionUID = 1L;

        /**
         * 流程 ID（可选，导入时可能重新生成）
         */
        private String id;

        /**
         * 流程名称
         */
        private String name;

        /**
         * 流程描述
         */
        private String description;

        /**
         * 流程 Key（流程定义唯一标识）
         * 导入时优先使用该字段恢复流程标识。
         */
        private String processKey;

        /**
         * 流程分类 ID
         */
        private String categoryId;

        /**
         * 流程标签
         */
        private List<String> tags;

        /**
         * 流程定义（JSON 对象）
         * 包含节点、连接、配置等完整的流程定义
         */
        private Object definition;

        /**
         * 流程版本号
         */
        private String version;

        /**
         * 元数据（扩展字段）
         * 可以存储额外的流程信息，如创建时间、更新时间等
         */
        private Map<String, Object> metadata;

        /**
         * 是否包含敏感配置
         * 如果为 true，表示导出时包含了敏感信息（如密码、密钥等）
         */
        private Boolean includeSensitive;
    }

    /**
     * 依赖信息内部类
     */
    @Data
    public static class DependencyInfo implements Serializable {
        private static final long serialVersionUID = 1L;

        /**
         * 使用的节点类型列表
         * 例如：["start", "end", "approval", "condition", "parallel"]
         */
        private List<String> nodeTypes;

        /**
         * 使用的集成列表
         * 例如：["email", "sms", "webhook"]
         */
        private List<String> integrations;

        /**
         * 最低兼容版本
         * 表示导入此流程需要的最低系统版本
         */
        private String minCompatibleVersion;
    }
}
