package com.cloudflow.workflow.domain.dto;

import lombok.Data;
import java.util.List;

/**
 * 影响分析DTO
 */
@Data
public class ImpactAnalysisDTO {

    /** 流程定义ID */
    private String processDefId;

    /** 影响项列表 */
    private List<ImpactItem> impacts;

    /** 总体影响级别 */
    private String overallLevel;

    /** 是否允许发布 */
    private Boolean allowDeploy;

    @Data
    public static class ImpactItem {
        private String impactType;
        private String impactLevel;
        private Integer impactCount;
        private String impactDetail;
        private String suggestion;
    }
}
