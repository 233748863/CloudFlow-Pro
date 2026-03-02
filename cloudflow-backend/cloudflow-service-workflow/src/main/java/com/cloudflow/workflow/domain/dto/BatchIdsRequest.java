package com.cloudflow.workflow.domain.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * 批量 ID 请求 DTO
 * 用于统一接收批量操作中的流程 ID 列表参数
 *
 * @author CloudFlow
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class BatchIdsRequest {

    /**
     * 流程 ID 列表
     */
    private List<String> workflowIds;
}
