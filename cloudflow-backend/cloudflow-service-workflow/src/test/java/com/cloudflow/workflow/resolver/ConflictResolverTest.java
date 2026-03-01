package com.cloudflow.workflow.resolver;

import com.cloudflow.workflow.domain.dto.ConflictResolution;
import com.cloudflow.workflow.domain.dto.WorkflowExportFormat;
import com.cloudflow.workflow.resolver.ConflictResolver.ConflictStrategy;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.*;

/**
 * ConflictResolver 单元测试
 * 注意：这些测试不依赖数据库，主要测试冲突解决逻辑
 * 
 * @author CloudFlow
 */
class ConflictResolverTest {

    private ConflictResolver conflictResolver;

    @BeforeEach
    void setUp() {
        conflictResolver = new ConflictResolver();
    }

    /**
     * 测试生成唯一名称 - 基本功能
     */
    @Test
    void testGenerateUniqueName() {
        String uniqueName = conflictResolver.generateUniqueName("测试流程");

        assertNotNull(uniqueName);
        assertTrue(uniqueName.startsWith("测试流程_副本_"));
        assertTrue(uniqueName.contains("_1") || uniqueName.contains("_2"));
    }

    /**
     * 测试验证策略 - 有效策略
     */
    @Test
    void testIsValidStrategy_Valid() {
        assertTrue(conflictResolver.isValidStrategy("overwrite"));
        assertTrue(conflictResolver.isValidStrategy("OVERWRITE"));
        assertTrue(conflictResolver.isValidStrategy("rename"));
        assertTrue(conflictResolver.isValidStrategy("skip"));
    }

    /**
     * 测试验证策略 - 无效策略
     */
    @Test
    void testIsValidStrategy_Invalid() {
        assertFalse(conflictResolver.isValidStrategy("invalid"));
        assertFalse(conflictResolver.isValidStrategy(""));
        assertFalse(conflictResolver.isValidStrategy(null));
    }

    /**
     * 测试解析策略
     */
    @Test
    void testParseStrategy() {
        assertEquals(ConflictStrategy.OVERWRITE, conflictResolver.parseStrategy("overwrite"));
        assertEquals(ConflictStrategy.RENAME, conflictResolver.parseStrategy("RENAME"));
        assertEquals(ConflictStrategy.SKIP, conflictResolver.parseStrategy("skip"));
        
        // 无效策略返回默认值 SKIP
        assertEquals(ConflictStrategy.SKIP, conflictResolver.parseStrategy("invalid"));
        assertEquals(ConflictStrategy.SKIP, conflictResolver.parseStrategy(null));
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

        exportFormat.setWorkflow(workflowData);

        return exportFormat;
    }
}
