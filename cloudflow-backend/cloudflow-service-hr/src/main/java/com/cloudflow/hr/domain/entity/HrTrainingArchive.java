package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * HR-P0-1 培训档案(物理化聚合)。
 *
 * <p>报名/证书变更触发增量重算 + 每日 02:30 兜底重建,
 * mine() / forEmployee() 优先读物理表, 未命中回退到旧实时聚合。
 */
@Data
@TableName("hr_training_archive")
public class HrTrainingArchive implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private Long employeeId;
    private BigDecimal totalHours;
    private Integer completionCount;
    private Integer certCount;
    private Integer ongoingCount;

    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate lastTrainingDate;

    /** JSON 形如 {"2024":12.5,"2025":40.0} */
    private String yearHours;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime refreshedAt;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;

    private String createBy;
    private String updateBy;

    @TableLogic
    private Integer deleted;
}
