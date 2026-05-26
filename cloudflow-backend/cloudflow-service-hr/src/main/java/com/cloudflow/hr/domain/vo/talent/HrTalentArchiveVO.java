package com.cloudflow.hr.domain.vo.talent;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * HR 人才档案聚合 VO（员工纵览：历次盘点 + 所在池 + 培养行动 + 继任提名）。
 */
@Data
@Schema(name = "HrTalentArchiveVO", description = "HR 人才档案聚合 VO")
public class HrTalentArchiveVO {
    @Schema(description = "员工基本信息") private HrTalentArchiveEmployeeBriefVO employee;
    @Schema(description = "历次盘点") private List<HrTalentArchiveReviewLineVO> reviews;
    @Schema(description = "所在人才池") private List<HrTalentArchivePoolLineVO> pools;
    @Schema(description = "培养行动") private List<HrTalentArchiveDevelopmentLineVO> developmentActions;
    @Schema(description = "继任提名") private List<HrTalentArchiveSuccessorLineVO> successorOf;

    @Data
    @Schema(name = "HrTalentArchiveEmployeeBriefVO", description = "员工档案简要信息")
    public static class HrTalentArchiveEmployeeBriefVO {
        @Schema(description = "员工 ID") private Long employeeId;
        @Schema(description = "员工编号") private String employeeNo;
        @Schema(description = "姓名") private String name;
        @Schema(description = "部门 ID") private Long deptId;
        @Schema(description = "岗位 ID") private Long positionId;
        @Schema(description = "员工状态") private String employeeStatus;
    }

    @Data
    @Schema(name = "HrTalentArchiveReviewLineVO", description = "盘点参与记录")
    public static class HrTalentArchiveReviewLineVO {
        @Schema(description = "盘点 ID") private Long reviewId;
        @Schema(description = "盘点编号") private String reviewNo;
        @Schema(description = "盘点名称") private String reviewName;
        @Schema(description = "盘点年度") private Integer reviewYear;
        @Schema(description = "九宫格位置") private Integer gridCell;
        @Schema(description = "绩效档位") private String performanceBand;
        @Schema(description = "潜力档位") private String potentialBand;
        @Schema(description = "绩效分") private BigDecimal performanceScore;
        @Schema(description = "潜力分") private BigDecimal potentialScore;
        @Schema(description = "校准备注") private String calibrationNotes;
        @Schema(description = "状态") private String status;
    }

    @Data
    @Schema(name = "HrTalentArchivePoolLineVO", description = "所在人才池")
    public static class HrTalentArchivePoolLineVO {
        @Schema(description = "人才池 ID") private Long poolId;
        @Schema(description = "人才池编号") private String poolNo;
        @Schema(description = "人才池名称") private String poolName;
        @Schema(description = "人才池类型") private String poolType;
        @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
        @Schema(description = "加入时间") private LocalDateTime joinedAt;
        @Schema(description = "状态") private String status;
    }

    @Data
    @Schema(name = "HrTalentArchiveDevelopmentLineVO", description = "培养行动")
    public static class HrTalentArchiveDevelopmentLineVO {
        @Schema(description = "行动 ID") private Long id;
        @Schema(description = "行动类型") private String actionType;
        @Schema(description = "行动名称") private String actionName;
        @Schema(description = "导师 ID") private Long mentorId;
        @Schema(description = "开始日期") private LocalDate startDate;
        @Schema(description = "结束日期") private LocalDate endDate;
        @Schema(description = "状态") private String status;
        @Schema(description = "评估分") private BigDecimal evaluationScore;
    }

    @Data
    @Schema(name = "HrTalentArchiveSuccessorLineVO", description = "继任提名")
    public static class HrTalentArchiveSuccessorLineVO {
        @Schema(description = "继任计划 ID") private Long planId;
        @Schema(description = "继任计划编号") private String planNo;
        @Schema(description = "继任计划名称") private String planName;
        @Schema(description = "目标岗位 ID") private Long positionId;
        @Schema(description = "就绪度") private String readiness;
        @Schema(description = "排序") private Integer rankOrder;
        @Schema(description = "状态") private String status;
    }
}
