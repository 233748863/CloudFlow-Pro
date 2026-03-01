package com.cloudflow.workflow.util;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;

import java.util.*;

/**
 * 版本号生成器工具类
 * 实现语义化版本号（Semantic Versioning）的生成和管理
 * 
 * 版本号格式：主版本号.次版本号.修订版本号 (Major.Minor.Patch)
 * - 主版本号（Major）：流程结构重大变更
 * - 次版本号（Minor）：功能性配置修改
 * - 修订版本号（Patch）：小修复和优化
 */
@Slf4j
public class VersionNumberGenerator {

    private static final ObjectMapper objectMapper = new ObjectMapper();

    /**
     * 版本号类
     * 用于解析和比较语义化版本号
     */
    public static class SemanticVersion implements Comparable<SemanticVersion> {
        private final int major;
        private final int minor;
        private final int patch;

        public SemanticVersion(int major, int minor, int patch) {
            if (major < 0 || minor < 0 || patch < 0) {
                throw new IllegalArgumentException("版本号的各部分必须是非负整数");
            }
            this.major = major;
            this.minor = minor;
            this.patch = patch;
        }

        /**
         * 从字符串解析版本号
         * @param versionString 版本号字符串，格式：X.Y.Z
         * @return SemanticVersion 对象
         */
        public static SemanticVersion parse(String versionString) {
            if (versionString == null || versionString.trim().isEmpty()) {
                throw new IllegalArgumentException("版本号字符串不能为空");
            }

            String[] parts = versionString.trim().split("\\.");
            if (parts.length != 3) {
                throw new IllegalArgumentException("版本号格式不正确，应为 X.Y.Z 格式");
            }

            try {
                int major = Integer.parseInt(parts[0]);
                int minor = Integer.parseInt(parts[1]);
                int patch = Integer.parseInt(parts[2]);
                return new SemanticVersion(major, minor, patch);
            } catch (NumberFormatException e) {
                throw new IllegalArgumentException("版本号各部分必须是整数", e);
            }
        }

        /**
         * 递增主版本号（重置次版本号和修订版本号）
         */
        public SemanticVersion incrementMajor() {
            return new SemanticVersion(major + 1, 0, 0);
        }

        /**
         * 递增次版本号（重置修订版本号）
         */
        public SemanticVersion incrementMinor() {
            return new SemanticVersion(major, minor + 1, 0);
        }

        /**
         * 递增修订版本号
         */
        public SemanticVersion incrementPatch() {
            return new SemanticVersion(major, minor, patch + 1);
        }

        @Override
        public String toString() {
            return major + "." + minor + "." + patch;
        }

        @Override
        public int compareTo(SemanticVersion other) {
            if (this.major != other.major) {
                return Integer.compare(this.major, other.major);
            }
            if (this.minor != other.minor) {
                return Integer.compare(this.minor, other.minor);
            }
            return Integer.compare(this.patch, other.patch);
        }

        @Override
        public boolean equals(Object obj) {
            if (this == obj) return true;
            if (obj == null || getClass() != obj.getClass()) return false;
            SemanticVersion that = (SemanticVersion) obj;
            return major == that.major && minor == that.minor && patch == that.patch;
        }

        @Override
        public int hashCode() {
            return Objects.hash(major, minor, patch);
        }

        public int getMajor() {
            return major;
        }

        public int getMinor() {
            return minor;
        }

        public int getPatch() {
            return patch;
        }
    }

    /**
     * 变更类型枚举
     */
    public enum ChangeType {
        /** 主版本变更：流程结构重大变更 */
        MAJOR("major"),
        /** 次版本变更：功能性配置修改 */
        MINOR("minor"),
        /** 修订版本变更：小修复和优化 */
        PATCH("patch");

        private final String value;

        ChangeType(String value) {
            this.value = value;
        }

        public String getValue() {
            return value;
        }

        public static ChangeType fromValue(String value) {
            for (ChangeType type : values()) {
                if (type.value.equalsIgnoreCase(value)) {
                    return type;
                }
            }
            throw new IllegalArgumentException("未知的变更类型: " + value);
        }
    }

    /**
     * 生成下一个版本号
     * @param currentVersion 当前版本号字符串
     * @param changeType 变更类型
     * @return 新的版本号字符串
     */
    public static String generateNextVersion(String currentVersion, ChangeType changeType) {
        SemanticVersion version = SemanticVersion.parse(currentVersion);
        
        SemanticVersion nextVersion;
        switch (changeType) {
            case MAJOR:
                nextVersion = version.incrementMajor();
                break;
            case MINOR:
                nextVersion = version.incrementMinor();
                break;
            case PATCH:
                nextVersion = version.incrementPatch();
                break;
            default:
                throw new IllegalArgumentException("未知的变更类型: " + changeType);
        }
        
        log.info("生成新版本号: {} -> {} (变更类型: {})", currentVersion, nextVersion, changeType);
        return nextVersion.toString();
    }

    /**
     * 检测流程定义的变更类型
     * @param oldDefinition 旧的流程定义（JSON字符串）
     * @param newDefinition 新的流程定义（JSON字符串）
     * @return 变更类型
     */
    public static ChangeType detectChangeType(String oldDefinition, String newDefinition) {
        try {
            JsonNode oldJson = objectMapper.readTree(oldDefinition);
            JsonNode newJson = objectMapper.readTree(newDefinition);

            // 检查是否有结构性变更（主版本）
            if (hasStructuralChanges(oldJson, newJson)) {
                log.info("检测到流程结构重大变更，变更类型: MAJOR");
                return ChangeType.MAJOR;
            }

            // 检查是否有配置变更（次版本）
            if (hasConfigurationChanges(oldJson, newJson)) {
                log.info("检测到流程配置修改，变更类型: MINOR");
                return ChangeType.MINOR;
            }

            // 默认为小修复（修订版本）
            log.info("检测到流程小修复或优化，变更类型: PATCH");
            return ChangeType.PATCH;

        } catch (Exception e) {
            log.error("检测变更类型失败，默认使用 PATCH", e);
            return ChangeType.PATCH;
        }
    }

    /**
     * 检查是否有结构性变更
     * 结构性变更包括：
     * - 新增或删除关键节点（开始、结束、审批节点）
     * - 节点类型变更
     * - 流程分支结构变更
     */
    private static boolean hasStructuralChanges(JsonNode oldJson, JsonNode newJson) {
        // 获取节点列表
        JsonNode oldNodes = oldJson.get("nodes");
        JsonNode newNodes = newJson.get("nodes");

        if (oldNodes == null || newNodes == null) {
            return false;
        }

        // 检查关键节点的变更
        Set<String> oldKeyNodeIds = getKeyNodeIds(oldNodes);
        Set<String> newKeyNodeIds = getKeyNodeIds(newNodes);

        // 如果关键节点有增删，则为结构性变更
        if (!oldKeyNodeIds.equals(newKeyNodeIds)) {
            log.debug("关键节点发生变更: 旧={}, 新={}", oldKeyNodeIds, newKeyNodeIds);
            return true;
        }

        // 检查节点类型是否变更
        if (hasNodeTypeChanges(oldNodes, newNodes)) {
            log.debug("节点类型发生变更");
            return true;
        }

        // 检查连接关系是否有重大变更（分支结构变更）
        JsonNode oldEdges = oldJson.get("edges");
        JsonNode newEdges = newJson.get("edges");
        if (hasBranchStructureChanges(oldEdges, newEdges)) {
            log.debug("流程分支结构发生变更");
            return true;
        }

        return false;
    }

    /**
     * 获取关键节点的ID集合
     * 关键节点包括：start（开始）、end（结束）、approval（审批）
     */
    private static Set<String> getKeyNodeIds(JsonNode nodes) {
        Set<String> keyNodeIds = new HashSet<>();
        if (nodes.isArray()) {
            for (JsonNode node : nodes) {
                String type = node.has("type") ? node.get("type").asText() : "";
                if (isKeyNodeType(type)) {
                    String id = node.has("id") ? node.get("id").asText() : "";
                    if (!id.isEmpty()) {
                        keyNodeIds.add(id);
                    }
                }
            }
        }
        return keyNodeIds;
    }

    /**
     * 判断是否为关键节点类型
     */
    private static boolean isKeyNodeType(String type) {
        return "start".equalsIgnoreCase(type) 
            || "end".equalsIgnoreCase(type) 
            || "approval".equalsIgnoreCase(type)
            || "userTask".equalsIgnoreCase(type);
    }

    /**
     * 检查节点类型是否有变更
     */
    private static boolean hasNodeTypeChanges(JsonNode oldNodes, JsonNode newNodes) {
        Map<String, String> oldNodeTypes = getNodeTypeMap(oldNodes);
        Map<String, String> newNodeTypes = getNodeTypeMap(newNodes);

        // 检查共同节点的类型是否变更
        for (String nodeId : oldNodeTypes.keySet()) {
            if (newNodeTypes.containsKey(nodeId)) {
                String oldType = oldNodeTypes.get(nodeId);
                String newType = newNodeTypes.get(nodeId);
                if (!oldType.equals(newType)) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * 获取节点ID到类型的映射
     */
    private static Map<String, String> getNodeTypeMap(JsonNode nodes) {
        Map<String, String> nodeTypeMap = new HashMap<>();
        if (nodes != null && nodes.isArray()) {
            for (JsonNode node : nodes) {
                String id = node.has("id") ? node.get("id").asText() : "";
                String type = node.has("type") ? node.get("type").asText() : "";
                if (!id.isEmpty()) {
                    nodeTypeMap.put(id, type);
                }
            }
        }
        return nodeTypeMap;
    }

    /**
     * 检查分支结构是否有变更
     */
    private static boolean hasBranchStructureChanges(JsonNode oldEdges, JsonNode newEdges) {
        if (oldEdges == null || newEdges == null) {
            return oldEdges != newEdges;
        }

        Set<String> oldEdgeSet = getEdgeSet(oldEdges);
        Set<String> newEdgeSet = getEdgeSet(newEdges);

        // 计算新增和删除的连接数量
        Set<String> addedEdges = new HashSet<>(newEdgeSet);
        addedEdges.removeAll(oldEdgeSet);

        Set<String> removedEdges = new HashSet<>(oldEdgeSet);
        removedEdges.removeAll(newEdgeSet);

        // 如果有超过2个连接的变更，认为是分支结构变更
        return (addedEdges.size() + removedEdges.size()) > 2;
    }

    /**
     * 获取连接的集合（格式：source->target）
     */
    private static Set<String> getEdgeSet(JsonNode edges) {
        Set<String> edgeSet = new HashSet<>();
        if (edges != null && edges.isArray()) {
            for (JsonNode edge : edges) {
                String source = edge.has("source") ? edge.get("source").asText() : 
                               edge.has("from") ? edge.get("from").asText() : "";
                String target = edge.has("target") ? edge.get("target").asText() : 
                               edge.has("to") ? edge.get("to").asText() : "";
                if (!source.isEmpty() && !target.isEmpty()) {
                    edgeSet.add(source + "->" + target);
                }
            }
        }
        return edgeSet;
    }

    /**
     * 检查是否有配置变更
     * 配置变更包括：
     * - 节点配置参数修改
     * - 新增非关键节点
     * - 连接关系的小调整
     */
    private static boolean hasConfigurationChanges(JsonNode oldJson, JsonNode newJson) {
        // 获取节点列表
        JsonNode oldNodes = oldJson.get("nodes");
        JsonNode newNodes = newJson.get("nodes");

        if (oldNodes == null || newNodes == null) {
            return false;
        }

        // 检查节点数量是否变更
        if (oldNodes.size() != newNodes.size()) {
            return true;
        }

        // 检查节点配置是否变更
        Map<String, JsonNode> oldNodeMap = getNodeMap(oldNodes);
        Map<String, JsonNode> newNodeMap = getNodeMap(newNodes);

        for (String nodeId : oldNodeMap.keySet()) {
            if (newNodeMap.containsKey(nodeId)) {
                JsonNode oldNode = oldNodeMap.get(nodeId);
                JsonNode newNode = newNodeMap.get(nodeId);
                
                // 检查节点的配置是否变更
                JsonNode oldConfig = oldNode.get("config");
                JsonNode newConfig = newNode.get("config");
                
                if (!Objects.equals(oldConfig, newConfig)) {
                    return true;
                }
            }
        }

        // 检查连接关系是否有小变更
        JsonNode oldEdges = oldJson.get("edges");
        JsonNode newEdges = newJson.get("edges");
        
        if (oldEdges != null && newEdges != null) {
            if (oldEdges.size() != newEdges.size()) {
                return true;
            }
        }

        return false;
    }

    /**
     * 获取节点ID到节点对象的映射
     */
    private static Map<String, JsonNode> getNodeMap(JsonNode nodes) {
        Map<String, JsonNode> nodeMap = new HashMap<>();
        if (nodes != null && nodes.isArray()) {
            for (JsonNode node : nodes) {
                String id = node.has("id") ? node.get("id").asText() : "";
                if (!id.isEmpty()) {
                    nodeMap.put(id, node);
                }
            }
        }
        return nodeMap;
    }

    /**
     * 验证版本号格式是否正确
     * @param versionString 版本号字符串
     * @return 是否有效
     */
    public static boolean isValidVersion(String versionString) {
        if (versionString == null || versionString.trim().isEmpty()) {
            return false;
        }

        try {
            SemanticVersion.parse(versionString);
            return true;
        } catch (IllegalArgumentException e) {
            return false;
        }
    }

    /**
     * 比较两个版本号
     * @param version1 版本号1
     * @param version2 版本号2
     * @return 负数表示version1 < version2，0表示相等，正数表示version1 > version2
     */
    public static int compareVersions(String version1, String version2) {
        SemanticVersion v1 = SemanticVersion.parse(version1);
        SemanticVersion v2 = SemanticVersion.parse(version2);
        return v1.compareTo(v2);
    }
}
