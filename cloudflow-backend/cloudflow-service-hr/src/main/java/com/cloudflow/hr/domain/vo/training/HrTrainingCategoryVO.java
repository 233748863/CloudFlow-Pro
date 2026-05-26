package com.cloudflow.hr.domain.vo.training;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * HR 培训分类 VO（剔除 deleted/tenantId）。
 */
@Data
@Schema(name = "HrTrainingCategoryVO", description = "HR 培训分类 VO")
public class HrTrainingCategoryVO {
    @Schema(description = "分类 ID") private Long id;
    @Schema(description = "父分类 ID") private Long parentId;
    @Schema(description = "分类名称") private String name;
    @Schema(description = "排序") private Integer sort;
    @Schema(description = "状态") private String status;
    @Schema(description = "创建人") private String createBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
    @Schema(description = "更新人") private String updateBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime updateTime;
}
