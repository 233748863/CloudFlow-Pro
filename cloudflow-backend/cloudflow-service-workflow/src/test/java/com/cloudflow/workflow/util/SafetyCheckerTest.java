package com.cloudflow.workflow.util;

import com.cloudflow.workflow.domain.dto.SafetyCheckResultDTO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * SafetyChecker 单元测试
 * 注意：这些测试不依赖数据库，主要测试安全检查逻辑
 * 
 * @author CloudFlow
 */
class SafetyCheckerTest {

    private SafetyChecker safetyChecker;

    @BeforeEach
    void setUp() {
        safetyChecker = new SafetyChecker();
    }

    /**
     * 测试 SafetyCheckResultDTO 安全结果创建
     */
    @Test
    void testSafetyCheckResultDTO_Safe() {
        SafetyCheckResultDTO result = SafetyCheckResultDTO.safe();

        assertNotNull(result);
        assertTrue(result.getSafe());
        assertEquals("安全检查通过，可以执行操作", result.getMessage());
        assertTrue(result.getWarnings().isEmpty());
        assertTrue(result.getErrors().isEmpty());
    }

    /**
     * 测试 SafetyCheckResultDTO 不安全结果创建
     */
    @Test
    void testSafetyCheckResultDTO_Unsafe() {
        SafetyCheckResultDTO result = SafetyCheckResultDTO.unsafe("有运行实例");

        assertNotNull(result);
        assertFalse(result.getSafe());
        assertEquals("有运行实例", result.getMessage());
    }

    /**
     * 测试添加警告信息
     */
    @Test
    void testSafetyCheckResultDTO_AddWarnings() {
        SafetyCheckResultDTO result = SafetyCheckResultDTO.builder()
            .safe(true)
            .build();

        result.getWarnings().add("警告1");
        result.getWarnings().add("警告2");

        assertEquals(2, result.getWarnings().size());
        assertTrue(result.getWarnings().contains("警告1"));
        assertTrue(result.getWarnings().contains("警告2"));
    }

    /**
     * 测试添加错误信息
     */
    @Test
    void testSafetyCheckResultDTO_AddErrors() {
        SafetyCheckResultDTO result = SafetyCheckResultDTO.builder()
            .safe(false)
            .build();

        result.getErrors().add("错误1");
        result.getErrors().add("错误2");

        assertEquals(2, result.getErrors().size());
        assertTrue(result.getErrors().contains("错误1"));
        assertTrue(result.getErrors().contains("错误2"));
    }

    /**
     * 测试详细信息
     */
    @Test
    void testSafetyCheckResultDTO_Details() {
        SafetyCheckResultDTO result = SafetyCheckResultDTO.builder()
            .safe(true)
            .build();

        result.getDetails().put("workflow-1", "有运行实例");
        result.getDetails().put("workflow-2", "被其他流程引用");

        assertEquals(2, result.getDetails().size());
        assertEquals("有运行实例", result.getDetails().get("workflow-1"));
        assertEquals("被其他流程引用", result.getDetails().get("workflow-2"));
    }

    /**
     * 测试运行实例列表
     */
    @Test
    void testSafetyCheckResultDTO_RunningInstances() {
        SafetyCheckResultDTO result = SafetyCheckResultDTO.builder()
            .safe(true)
            .build();

        result.getWorkflowsWithRunningInstances().add("workflow-1");
        result.getWorkflowsWithRunningInstances().add("workflow-2");

        assertEquals(2, result.getWorkflowsWithRunningInstances().size());
        assertTrue(result.getWorkflowsWithRunningInstances().contains("workflow-1"));
    }

    /**
     * 测试依赖关系列表
     */
    @Test
    void testSafetyCheckResultDTO_Dependencies() {
        SafetyCheckResultDTO result = SafetyCheckResultDTO.builder()
            .safe(true)
            .build();

        result.getWorkflowsWithDependencies().add("workflow-1");

        assertEquals(1, result.getWorkflowsWithDependencies().size());
        assertTrue(result.getWorkflowsWithDependencies().contains("workflow-1"));
    }

    /**
     * 测试权限列表
     */
    @Test
    void testSafetyCheckResultDTO_Permissions() {
        SafetyCheckResultDTO result = SafetyCheckResultDTO.builder()
            .safe(false)
            .build();

        result.getWorkflowsWithoutPermission().add("workflow-1");

        assertEquals(1, result.getWorkflowsWithoutPermission().size());
        assertTrue(result.getWorkflowsWithoutPermission().contains("workflow-1"));
    }
}
