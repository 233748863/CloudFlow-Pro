package com.cloudflow.workflow.service.impl;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * ExportServiceImpl 单元测试
 * 
 * @author CloudFlow
 */
class ExportServiceImplTest {

    private final ExportServiceImpl exportService = new ExportServiceImpl();

    /**
     * 测试生成导出文件名
     */
    @Test
    void testGenerateExportFileName() {
        String fileName = exportService.generateExportFileName("测试流程", "1.0.0");
        
        assertNotNull(fileName);
        assertTrue(fileName.startsWith("workflow_测试流程_1.0.0_"));
        assertTrue(fileName.endsWith(".json"));
    }

    /**
     * 测试生成批量导出文件名
     */
    @Test
    void testGenerateBatchExportFileName() {
        String fileName = exportService.generateBatchExportFileName();
        
        assertNotNull(fileName);
        assertTrue(fileName.startsWith("workflows_batch_"));
        assertTrue(fileName.endsWith(".json"));
    }

    /**
     * 测试文件名清理（移除非法字符）
     */
    @Test
    void testGenerateExportFileName_WithSpecialCharacters() {
        String fileName = exportService.generateExportFileName("测试/流程:名称*", "1.0.0");
        
        assertNotNull(fileName);
        assertFalse(fileName.contains("/"));
        assertFalse(fileName.contains(":"));
        assertFalse(fileName.contains("*"));
    }

    /**
     * 测试文件名格式
     */
    @Test
    void testGenerateExportFileName_Format() {
        String fileName = exportService.generateExportFileName("My Workflow", "2.1.3");
        
        assertNotNull(fileName);
        assertTrue(fileName.matches("workflow_My_Workflow_2\\.1\\.3_\\d{8}_\\d{6}\\.json"));
    }

    /**
     * 测试批量导出文件名格式
     */
    @Test
    void testGenerateBatchExportFileName_Format() {
        String fileName = exportService.generateBatchExportFileName();
        
        assertNotNull(fileName);
        assertTrue(fileName.matches("workflows_batch_\\d{8}_\\d{6}\\.json"));
    }
}
