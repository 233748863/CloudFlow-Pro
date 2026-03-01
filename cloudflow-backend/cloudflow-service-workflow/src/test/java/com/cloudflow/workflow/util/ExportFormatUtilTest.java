package com.cloudflow.workflow.util;

import com.cloudflow.workflow.domain.dto.WorkflowExportFormat;
import com.cloudflow.workflow.exception.WorkflowException;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * ExportFormatUtil 单元测试
 * 
 * @author CloudFlow
 */
class ExportFormatUtilTest {

    /**
     * 测试序列化功能
     */
    @Test
    void testSerialize() {
        // 准备测试数据
        WorkflowExportFormat exportFormat = createTestExportFormat();
        
        // 执行序列化
        String json = ExportFormatUtil.serialize(exportFormat);
        
        // 验证结果
        assertNotNull(json);
        assertTrue(json.contains("\"version\" : \"1.0.0\""));
        assertTrue(json.contains("\"name\" : \"测试流程\""));
        assertTrue(json.contains("\"exportedBy\" : \"user123\""));
    }

    /**
     * 测试反序列化功能
     */
    @Test
    void testDeserialize() {
        // 准备测试数据
        WorkflowExportFormat original = createTestExportFormat();
        String json = ExportFormatUtil.serialize(original);
        
        // 执行反序列化
        WorkflowExportFormat deserialized = ExportFormatUtil.deserialize(json);
        
        // 验证结果
        assertNotNull(deserialized);
        assertEquals(original.getVersion(), deserialized.getVersion());
        assertEquals(original.getExportedBy(), deserialized.getExportedBy());
        assertEquals(original.getWorkflow().getName(), deserialized.getWorkflow().getName());
    }

    /**
     * 测试校验和计算功能
     */
    @Test
    void testCalculateChecksum() {
        // 准备测试数据
        WorkflowExportFormat exportFormat = createTestExportFormat();
        
        // 执行校验和计算
        String checksum = ExportFormatUtil.calculateChecksum(exportFormat);
        
        // 验证结果
        assertNotNull(checksum);
        assertEquals(64, checksum.length()); // SHA-256 产生 64 个十六进制字符
        assertTrue(checksum.matches("[0-9a-f]{64}")); // 验证是十六进制字符串
    }

    /**
     * 测试校验和验证功能 - 正确的校验和
     */
    @Test
    void testVerifyChecksum_Valid() {
        // 准备测试数据
        WorkflowExportFormat exportFormat = createTestExportFormat();
        String checksum = ExportFormatUtil.calculateChecksum(exportFormat);
        exportFormat.setChecksum(checksum);
        
        // 执行验证
        boolean isValid = ExportFormatUtil.verifyChecksum(exportFormat);
        
        // 验证结果
        assertTrue(isValid);
    }

    /**
     * 测试校验和验证功能 - 错误的校验和
     */
    @Test
    void testVerifyChecksum_Invalid() {
        // 准备测试数据
        WorkflowExportFormat exportFormat = createTestExportFormat();
        exportFormat.setChecksum("invalid_checksum");
        
        // 执行验证
        boolean isValid = ExportFormatUtil.verifyChecksum(exportFormat);
        
        // 验证结果
        assertFalse(isValid);
    }

    /**
     * 测试序列化并计算校验和
     */
    @Test
    void testSerializeWithChecksum() {
        // 准备测试数据
        WorkflowExportFormat exportFormat = createTestExportFormat();
        
        // 执行序列化
        String json = ExportFormatUtil.serializeWithChecksum(exportFormat);
        
        // 验证结果
        assertNotNull(json);
        assertNotNull(exportFormat.getChecksum());
        assertTrue(json.contains("\"checksum\""));
    }

    /**
     * 测试反序列化并验证校验和 - 成功
     */
    @Test
    void testDeserializeAndVerify_Success() {
        // 准备测试数据
        WorkflowExportFormat original = createTestExportFormat();
        String json = ExportFormatUtil.serializeWithChecksum(original);
        
        // 执行反序列化和验证
        WorkflowExportFormat deserialized = ExportFormatUtil.deserializeAndVerify(json);
        
        // 验证结果
        assertNotNull(deserialized);
        assertEquals(original.getWorkflow().getName(), deserialized.getWorkflow().getName());
    }

    /**
     * 测试反序列化并验证校验和 - 失败
     */
    @Test
    void testDeserializeAndVerify_Failure() {
        // 准备测试数据
        WorkflowExportFormat original = createTestExportFormat();
        String originalJson = ExportFormatUtil.serializeWithChecksum(original);
        
        // 篡改 JSON（修改流程名称但不更新校验和）
        final String tamperedJson = originalJson.replace("测试流程", "被篡改的流程");
        
        // 执行反序列化和验证，应该抛出异常
        assertThrows(WorkflowException.class, () -> {
            ExportFormatUtil.deserializeAndVerify(tamperedJson);
        });
    }

    /**
     * 测试相同数据产生相同的校验和
     */
    @Test
    void testChecksum_Consistency() {
        // 准备测试数据
        WorkflowExportFormat exportFormat1 = createTestExportFormat();
        WorkflowExportFormat exportFormat2 = createTestExportFormat();
        
        // 计算校验和
        String checksum1 = ExportFormatUtil.calculateChecksum(exportFormat1);
        String checksum2 = ExportFormatUtil.calculateChecksum(exportFormat2);
        
        // 验证结果 - 相同的数据应该产生相同的校验和
        assertEquals(checksum1, checksum2);
    }

    /**
     * 测试不同数据产生不同的校验和
     */
    @Test
    void testChecksum_Uniqueness() {
        // 准备测试数据
        WorkflowExportFormat exportFormat1 = createTestExportFormat();
        WorkflowExportFormat exportFormat2 = createTestExportFormat();
        exportFormat2.getWorkflow().setName("不同的流程名称");
        
        // 计算校验和
        String checksum1 = ExportFormatUtil.calculateChecksum(exportFormat1);
        String checksum2 = ExportFormatUtil.calculateChecksum(exportFormat2);
        
        // 验证结果 - 不同的数据应该产生不同的校验和
        assertNotEquals(checksum1, checksum2);
    }

    /**
     * 创建测试用的导出格式对象
     */
    private WorkflowExportFormat createTestExportFormat() {
        WorkflowExportFormat exportFormat = new WorkflowExportFormat();
        exportFormat.setVersion("1.0.0");
        exportFormat.setExportedAt(LocalDateTime.now());
        exportFormat.setExportedBy("user123");
        exportFormat.setExportedByName("测试用户");
        
        // 创建流程数据
        WorkflowExportFormat.WorkflowData workflow = new WorkflowExportFormat.WorkflowData();
        workflow.setId("workflow123");
        workflow.setName("测试流程");
        workflow.setDescription("这是一个测试流程");
        workflow.setCategoryId("category1");
        workflow.setTags(Arrays.asList("测试", "示例"));
        workflow.setVersion("1.0.0");
        workflow.setIncludeSensitive(false);
        
        // 创建流程定义
        Map<String, Object> definition = new HashMap<>();
        definition.put("nodes", Arrays.asList("start", "end"));
        definition.put("edges", Arrays.asList());
        workflow.setDefinition(definition);
        
        // 创建元数据
        Map<String, Object> metadata = new HashMap<>();
        metadata.put("createdAt", "2024-01-01T00:00:00");
        metadata.put("updatedAt", "2024-01-01T00:00:00");
        workflow.setMetadata(metadata);
        
        exportFormat.setWorkflow(workflow);
        
        // 创建依赖信息
        WorkflowExportFormat.DependencyInfo dependencies = new WorkflowExportFormat.DependencyInfo();
        dependencies.setNodeTypes(Arrays.asList("start", "end", "approval"));
        dependencies.setIntegrations(Arrays.asList("email"));
        dependencies.setMinCompatibleVersion("1.0.0");
        exportFormat.setDependencies(dependencies);
        
        return exportFormat;
    }
}
