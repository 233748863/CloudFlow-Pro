package com.cloudflow.hr.domain.vo;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import com.cloudflow.hr.domain.dto.PerformanceCategoryDefinitionDTO;
import com.cloudflow.hr.domain.dto.PerformanceMetricDTO;

@Data
public class PerformanceObjectiveVO {

    private Long id;

    private String objectiveNo;

    private String cycleName;

    private LocalDate cycleStartDate;

    private LocalDate cycleEndDate;

    private String objectiveName;

    private BigDecimal totalTargetAmount;

    private BigDecimal actualAmount;

    private BigDecimal completionRate;

    private BigDecimal cappedRate;

    private BigDecimal score;

    private String grade;

    private List<String> categoryCodes;

    private List<PerformanceCategoryDefinitionDTO> categoryDefinitions = new ArrayList<>();

    private List<PerformanceMetricDTO> metrics = new ArrayList<>();

    private BigDecimal scoreCap;

    private BigDecimal archivedActualAmount;

    private BigDecimal archivedCompletionRate;

    private BigDecimal archivedCappedRate;

    private BigDecimal archivedScore;

    private String archivedGrade;

    private LocalDateTime archivedTime;

    private String planProcessInstanceId;

    private String resultProcessInstanceId;

    private String status;

    private Integer departmentCount;

    private Integer leafTaskCount;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;

    private List<PerformanceAssignmentVO> assignments = new ArrayList<>();
}
