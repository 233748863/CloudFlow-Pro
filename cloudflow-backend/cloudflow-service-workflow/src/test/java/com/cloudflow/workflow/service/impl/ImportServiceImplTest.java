package com.cloudflow.workflow.service.impl;

import com.cloudflow.workflow.domain.dto.ImportResultDTO;
import com.cloudflow.workflow.domain.dto.WorkflowExportFormat;
import com.cloudflow.workflow.resolver.ConflictResolver.ConflictStrategy;
import com.cloudflow.workflow.service.IImportService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * ImportServiceImpl 单元测试
 * 注意：这些测试不依赖数据库，主要测试导入逻辑
 * 
 * @author CloudFlow
 */
class ImportServiceImplTest {

    private IImportService importService;

    @BeforeEach
    void setUp() {
        importService = new ImportServiceImpl();
    }

    /**
     * 测试 ImportResultDTO 成功结果创建
     */
    @Test
    void testImportResultDTO_Success() {
        ImportResultDTO result = ImportResultDTO.success("workflow-123", "测试流程", "created");

        assertNotNull(result);
        assertTrue(result.getSuccess());
        assertEquals("workflow-123", result.getWorkflowId());
        assertEquals("测试流程", result.getWorkflowName());
        assertEquals("created", result.getAction());
        assertEquals("导入成功", result.getMessage());
    }

    /**
     * 测试 ImportResultDTO 失败结果创建
     */
    @Test
    void testImportResultDTO_Failure() {
        ImportResultDTO result = ImportResultDTO.failure("测试流程", "验证失败");

        assertNotNull(result);
        assertFalse(result.getSuccess());
        assertEquals("测试流程", result.getWorkflowName());
        assertEquals("failed", result.getAction());
        assertEquals("导入失败", result.getMessage());
        assertFalse(result.getErrors().isEmpty());
        assertTrue(result.getErrors().contains("验证失败"));
    }

    /**
     * 测试 ImportResultDTO 跳过结果创建
     */
    @Test
    void testImportResultDTO_Skipped() {
        ImportResultDTO result = ImportResultDTO.skipped("测试流程", "名称冲突");

        assertNotNull(result);
        assertTrue(result.getSuccess());
        assertEquals("测试流程", result.getWorkflowName());
        assertEquals("skipped", result.getAction());
        assertTrue(result.getMessage().contains("跳过"));
        assertTrue(result.getMessage().contains("名称冲突"));
    }

    /**
     * 测试创建导出格式对象
     */
    @Test
    void testCreateExportFormat() {
        WorkflowExportFormat exportFormat = createTestExportFormat("测试流程");

        assertNotNull(exportFormat);
        assertNotNull(exportFormat.getWorkflow());
        assertEquals("测试流程", exportFormat.getWorkflow().getName());
        assertEquals("1.0.0", exportFormat.getVersion());
    }

    /**
     * 创建测试用的导出格式对象
     */
    private WorkflowExportFormat createTestExportFormat(String workflowName) {
        WorkflowExportFormat exportFormat = new WorkflowExportFormat();
        exportFormat.setVersion("1.0.0");
        exportFormat.setExportedAt(LocalDateTime.now());
        exportFormat.setExportedBy("test-user");

        WorkflowExportFormat.WorkflowData workflowData = new WorkflowExportFormat.WorkflowData();
        workflowData.setId("test-id");
        workflowData.setName(workflowName);
        workflowData.setDescription("测试流程描述");
        workflowData.setVersion("1.0.0");

        // 创建流程定义
        Map<String, Object> definition = new HashMap<>();
        definition.put("nodes", Arrays.asList(
            createNode("start", "start", "开始"),
            createNode("end", "end", "结束")
        ));
        definition.put("edges", Arrays.asList());
        workflowData.setDefinition(definition);

        exportFormat.setWorkflow(workflowData);

        // 创建依赖信息
        WorkflowExportFormat.DependencyInfo dependencies = new WorkflowExportFormat.DependencyInfo();
        dependencies.setNodeTypes(Arrays.asList("start", "end"));
        dependencies.setIntegrations(Arrays.asList());
        dependencies.setMinCompatibleVersion("1.0.0");
        exportFormat.setDependencies(dependencies);

        return exportFormat;
    }

    /**
     * 创建节点对象
     */
    private Map<String, Object> createNode(String id, String type, String name) {
        Map<String, Object> node = new HashMap<>();
        node.put("id", id);
        node.put("type", type);
        node.put("name", name);
        return node;
    }
}
