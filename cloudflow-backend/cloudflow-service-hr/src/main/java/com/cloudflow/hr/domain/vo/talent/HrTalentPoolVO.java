package com.cloudflow.hr.domain.vo.talent;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 人才池视图。
 */
@Data
@Schema(name = "HrTalentPoolVO", description = "人才池视图")
public class HrTalentPoolVO {

    @Schema(description = "池主键")
    private Long id;

    @Schema(description = "池编号")
    private String poolNo;

    @Schema(description = "池名称")
    private String poolName;

    @Schema(description = "池类型")
    private String poolType;

    @Schema(description = "池说明")
    private String description;

    @Schema(description = "池责任人员工 ID")
    private Long ownerId;

    @Schema(description = "状态")
    private String status;

    @Schema(description = "创建时间")
    private LocalDateTime createTime;

    @Schema(description = "更新时间")
    private LocalDateTime updateTime;
}
