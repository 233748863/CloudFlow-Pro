package com.cloudflow.workflow.service.impl;

import com.cloudflow.workflow.domain.dto.AuditLogDTO;
import com.cloudflow.workflow.enums.OperationType;
import com.cloudflow.workflow.enums.TargetType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 审计日志服务测试
 * 注意：这些测试不依赖数据库，主要测试业务逻辑
 * 
 * @author CloudFlow
 */
class AuditLogServiceImplTest {

    private AuditLogServiceImpl auditLogService;

    @BeforeEach
    void setUp() {
        auditLogService = new AuditLogServiceImpl();
    }

    /**
     * 测试操作类型枚举
     */
    @Test
    void testOperationType() {
        // 验证操作类型枚举
        assertEquals("模板创建", OperationType.TEMPLATE_CREATE.getDescription());
        assertEquals("流程归档", OperationType.WORKFLOW_ARCHIVE.getDescription());
        assertEquals("版本回滚", OperationType.VERSION_ROLLBACK.getDescription());
        assertEquals("批量删除", OperationType.BATCH_DELETE.getDescription());
    }

    /**
     * 测试目标类型枚举
     */
    @Test
    void testTargetType() {
        // 验证目标类型枚举
        assertEquals("模板", TargetType.TEMPLATE.getDescription());
        assertEquals("流程", TargetType.WORKFLOW.getDescription());
        assertEquals("版本", TargetType.VERSION.getDescription());
        assertEquals("分类", TargetType.CATEGORY.getDescription());
    }

    /**
     * 测试 AuditLogDTO 构建
     */
    @Test
    void testAuditLogDTOBuilder() {
        // 构建 AuditLogDTO
        AuditLogDTO dto = AuditLogDTO.builder()
            .id("log-001")
            .operationType(OperationType.WORKFLOW_ARCHIVE.name())
            .targetType(TargetType.WORKFLOW.name())
            .targetId("workflow-001")
            .targetName("测试流程")
            .operatorId("user-001")
            .operatorName("测试用户")
            .operationReason("归档测试")
            .operationResult("SUCCESS")
            .build();

        // 验证 DTO 字段
        assertNotNull(dto);
        assertEquals("log-001", dto.getId());
        assertEquals(OperationType.WORKFLOW_ARCHIVE.name(), dto.getOperationType());
        assertEquals(TargetType.WORKFLOW.name(), dto.getTargetType());
        assertEquals("workflow-001", dto.getTargetId());
        assertEquals("测试流程", dto.getTargetName());
        assertEquals("user-001", dto.getOperatorId());
        assertEquals("测试用户", dto.getOperatorName());
        assertEquals("归档测试", dto.getOperationReason());
        assertEquals("SUCCESS", dto.getOperationResult());
    }

    /**
     * 测试所有操作类型枚举值
     */
    @Test
    void testAllOperationTypes() {
        // 验证所有操作类型都有描述
        for (OperationType type : OperationType.values()) {
            assertNotNull(type.getDescription());
            assertFalse(type.getDescription().isEmpty());
        }
    }

    /**
     * 测试所有目标类型枚举值
     */
    @Test
    void testAllTargetTypes() {
        // 验证所有目标类型都有描述
        for (TargetType type : TargetType.values()) {
            assertNotNull(type.getDescription());
            assertFalse(type.getDescription().isEmpty());
        }
    }
}
