package com.cloudflow.workflow.domain.dto;

import lombok.Data;
import java.util.List;

/**
 * 版本对比结果 DTO
 */
@Data
public class VersionComparisonDTO {
    /** 源版本号 */
    private String fromVersion;

    /** 目标版本号 */
    private String toVersion;

    /** 新增的节点 */
    private List<NodeChange> addedNodes;

    /** 删除的节点 */
    private List<NodeChange> removedNodes;

    /** 修改的节点 */
    private List<NodeChange> modifiedNodes;

    /** 新增的连接 */
    private List<EdgeChange> addedEdges;

    /** 删除的连接 */
    private List<EdgeChange> removedEdges;

    /** 配置变更 */
    private List<ConfigChange> configChanges;

    /**
     * 节点变更
     */
    @Data
    public static class NodeChange {
        /** 节点ID */
        private String nodeId;

        /** 节点名称 */
        private String nodeName;

        /** 节点类型 */
        private String nodeType;

        /** 属性变更列表 */
        private List<PropertyChange> changes;
    }

    /**
     * 连接变更
     */
    @Data
    public static class EdgeChange {
        /** 连接ID */
        private String edgeId;

        /** 源节点ID */
        private String sourceId;

        /** 目标节点ID */
        private String targetId;
    }

    /**
     * 配置变更
     */
    @Data
    public static class ConfigChange {
        /** 配置路径 */
        private String path;

        /** 旧值 */
        private Object oldValue;

        /** 新值 */
        private Object newValue;
    }

    /**
     * 属性变更
     */
    @Data
    public static class PropertyChange {
        /** 属性路径 */
        private String path;

        /** 旧值 */
        private Object oldValue;

        /** 新值 */
        private Object newValue;
    }
}
