package cn.joywon.poco.knowledge.entity;

import com.baomidou.mybatisplus.annotation.*;
import com.baomidou.mybatisplus.extension.activerecord.Model;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDateTime;

/**
 * AI 数据集管理表
 *
 * @author poco
 * @date 2025-03-26 21:47:45
 */
@Data
@TableName("ai_data")
@EqualsAndHashCode(callSuper = true)
@Schema(description = "AI 数据集管理表")
public class AiDataEntity extends Model<AiDataEntity> {


    /**
     * 主键ID
     */
    @TableId(type = IdType.ASSIGN_ID)
    @Schema(description = "主键ID")
    private Long dataId;

    /**
     * 数据集名称
     */
    @Schema(description = "数据集名称")
    private String datasetName;

    /**
     * 数据集描述
     */
    @Schema(description = "数据集描述")
    private String description;

    /**
     * 数据集类型 (1-明细表, 2-多指标周期表, 3-键值对表, 4-其他)
     */
    @Schema(description = "数据集类型 (1-明细表, 2-多指标周期表, 3-键值对表, 4-其他)")
    private String datasetType;

    /**
     * 关联数据源名称
     */
    @Schema(description = "关联数据源名称")
    private String dsName;

    /**
     * 学习状态（0-未学习, 1-已学习）
     */
    @Schema(description = "学习状态（0-未学习, 1-已学习）")
    private String learningStatus;

    /**
     * 关联数据表
     */
    @Schema(description = "关联数据表")
    private String[] tableName;

    /**
     * 创建人
     */
    @TableField(fill = FieldFill.INSERT)
    @Schema(description = "创建人")
    private String createBy;

    /**
     * 创建时间
     */
    @TableField(fill = FieldFill.INSERT)
    @Schema(description = "创建时间")
    private LocalDateTime createTime;

    /**
     * 更新人
     */
    @TableField(fill = FieldFill.INSERT_UPDATE)
    @Schema(description = "更新人")
    private String updateBy;

    /**
     * 更新时间
     */
    @TableField(fill = FieldFill.INSERT_UPDATE)
    @Schema(description = "更新时间")
    private LocalDateTime updateTime;

    /**
     * 删除标记 (0-正常, 1-删除)
     */
    @TableLogic
    @TableField(fill = FieldFill.INSERT)
    @Schema(description = "删除标记 (0-正常, 1-删除)")
    private String delFlag;
}
