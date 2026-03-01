package com.cloudflow.workflow.service.impl;

import com.cloudflow.workflow.domain.dto.BatchOperationResultDTO;
import com.cloudflow.workflow.domain.dto.OperationDetailDTO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * ArchiveServiceImpl 单元测试
 * 注意：这些测试不依赖数据库，主要测试业务逻辑
 * 
 * @author CloudFlow
 */
class ArchiveServiceImplTest {

    private ArchiveServiceImpl archiveService;

    @BeforeEach
    void setUp() {
        archiveService = new ArchiveServiceImpl();
    }

    /**
     * 测试 BatchOperationResultDTO 构建
     */
    @Test
    void testBatchOperationResultDTO_Builder() {
        List<OperationDetailDTO> details = Arrays.asList(
            OperationDetailDTO.builder()
                .workflowId("wf-1")
                .workflowName("流程1")
                .status("success")
                .message("归档成功")
                .build(),
            OperationDetailDTO.builder()
                .workflowId("wf-2")
                .workflowName("流程2")
                .status("failed")
                .message("归档失败")
                .build()
        );

        BatchOperationResultDTO result = BatchOperationResultDTO.builder()
            .totalCount(2)
            .successCount(1)
            .failedCount(1)
            .skippedCount(0)
            .message("归档完成")
            .details(details)
            .build();

        assertNotNull(result);
        assertEquals(2, result.getTotalCount());
        assertEquals(1, result.getSuccessCount());
        assertEquals(1, result.getFailedCount());
        assertEquals(0, result.getSkippedCount());
        assertEquals("归档完成", result.getMessage());
        assertEquals(2, result.getDetails().size());
    }

    /**
     * 测试 OperationDetailDTO 成功状态
     */
    @Test
    void testOperationDetailDTO_Success() {
        OperationDetailDTO detail = OperationDetailDTO.builder()
            .workflowId("wf-1")
            .workflowName("测试流程")
            .status("success")
            .message("操作成功")
            .build();

        assertNotNull(detail);
        assertEquals("wf-1", detail.getWorkflowId());
        assertEquals("测试流程", detail.getWorkflowName());
        assertEquals("success", detail.getStatus());
        assertEquals("操作成功", detail.getMessage());
    }

    /**
     * 测试 OperationDetailDTO 失败状态
     */
    @Test
    void testOperationDetailDTO_Failed() {
        OperationDetailDTO detail = OperationDetailDTO.builder()
            .workflowId("wf-2")
            .workflowName("测试流程2")
            .status("failed")
            .message("流程不存在")
            .build();

        assertNotNull(detail);
        assertEquals("failed", detail.getStatus());
        assertEquals("流程不存在", detail.getMessage());
    }

    /**
     * 测试 OperationDetailDTO 跳过状态
     */
    @Test
    void testOperationDetailDTO_Skipped() {
        OperationDetailDTO detail = OperationDetailDTO.builder()
            .workflowId("wf-3")
            .workflowName("测试流程3")
            .status("skipped")
            .message("流程已归档")
            .build();

        assertNotNull(detail);
        assertEquals("skipped", detail.getStatus());
        assertEquals("流程已归档", detail.getMessage());
    }

    /**
     * 测试批量操作结果统计
     */
    @Test
    void testBatchOperationResult_Statistics() {
        List<OperationDetailDTO> details = Arrays.asList(
            OperationDetailDTO.builder().status("success").build(),
            OperationDetailDTO.builder().status("success").build(),
            OperationDetailDTO.builder().status("failed").build(),
            OperationDetailDTO.builder().status("skipped").build()
        );

        long successCount = details.stream()
            .filter(d -> "success".equals(d.getStatus()))
            .count();
        long failedCount = details.stream()
            .filter(d -> "failed".equals(d.getStatus()))
            .count();
        long skippedCount = details.stream()
            .filter(d -> "skipped".equals(d.getStatus()))
            .count();

        assertEquals(2, successCount);
        assertEquals(1, failedCount);
        assertEquals(1, skippedCount);
    }
}
