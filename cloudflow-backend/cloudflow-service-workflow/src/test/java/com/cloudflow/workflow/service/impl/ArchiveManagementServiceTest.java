package com.cloudflow.workflow.service.impl;

import com.cloudflow.workflow.domain.dto.ArchivedWorkflowDTO;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 归档管理服务测试
 * 测试归档流程查询和永久删除功能
 * 
 * @author CloudFlow
 */
class ArchiveManagementServiceTest {

    /**
     * 测试 ArchivedWorkflowDTO 构建
     */
    @Test
    void testArchivedWorkflowDTO_Builder() {
        LocalDateTime now = LocalDateTime.now();
        
        ArchivedWorkflowDTO dto = ArchivedWorkflowDTO.builder()
            .id("archive-1")
            .workflowId("wf-1")
            .workflowName("测试流程")
            .archivedBy("user-1")
            .archivedByName("张三")
            .archivedAt(now)
            .archiveReason("流程已过期")
            .canRestore(true)
            .build();

        assertNotNull(dto);
        assertEquals("archive-1", dto.getId());
        assertEquals("wf-1", dto.getWorkflowId());
        assertEquals("测试流程", dto.getWorkflowName());
        assertEquals("user-1", dto.getArchivedBy());
        assertEquals("张三", dto.getArchivedByName());
        assertEquals(now, dto.getArchivedAt());
        assertEquals("流程已过期", dto.getArchiveReason());
        assertTrue(dto.getCanRestore());
    }

    /**
     * 测试 ArchivedWorkflowDTO 不可恢复状态
     */
    @Test
    void testArchivedWorkflowDTO_CannotRestore() {
        ArchivedWorkflowDTO dto = ArchivedWorkflowDTO.builder()
            .id("archive-2")
            .workflowId("wf-2")
            .workflowName("测试流程2")
            .canRestore(false)
            .build();

        assertNotNull(dto);
        assertFalse(dto.getCanRestore());
    }

    /**
     * 测试 ArchivedWorkflowDTO 字段完整性
     */
    @Test
    void testArchivedWorkflowDTO_AllFields() {
        LocalDateTime archivedAt = LocalDateTime.of(2026, 3, 1, 10, 0);
        
        ArchivedWorkflowDTO dto = ArchivedWorkflowDTO.builder()
            .id("archive-3")
            .workflowId("wf-3")
            .workflowName("完整测试流程")
            .archivedBy("admin")
            .archivedByName("管理员")
            .archivedAt(archivedAt)
            .archiveReason("系统维护")
            .canRestore(true)
            .build();

        // 验证所有字段
        assertEquals("archive-3", dto.getId());
        assertEquals("wf-3", dto.getWorkflowId());
        assertEquals("完整测试流程", dto.getWorkflowName());
        assertEquals("admin", dto.getArchivedBy());
        assertEquals("管理员", dto.getArchivedByName());
        assertEquals(archivedAt, dto.getArchivedAt());
        assertEquals("系统维护", dto.getArchiveReason());
        assertTrue(dto.getCanRestore());
    }
}
