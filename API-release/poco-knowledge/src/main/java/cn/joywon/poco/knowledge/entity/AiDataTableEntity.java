package cn.joywon.poco.knowledge.entity;

import com.baomidou.mybatisplus.annotation.*;
import com.baomidou.mybatisplus.extension.activerecord.Model;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.experimental.FieldNameConstants;

import java.time.LocalDateTime;

/**
 * AI  数据表管理表
 *
 * @author poco
 * @date 2025-03-26 21:48:16
 */
@Data
@FieldNameConstants
@TableName("ai_data_table")
@EqualsAndHashCode(callSuper = true)
@Schema(description = "AI  数据表管理表")
public class AiDataTableEntity extends Model<AiDataTableEntity> {


    /**
     * 主键ID
     */
    @TableId(type = IdType.ASSIGN_ID)
    @Schema(description = "主键ID")
    private Long tableId;

    /**
     * 关联数据源名称
     */
    @Schema(description = "关联数据源名称")
    private String dsName;

    /**
     * 表名称
     */
    @Schema(description = "表名称")
    private String tableName;

    /**
     * 物理表注释
     */
    @Schema(description = "物理表注释")
    private String tableComment;

    /**
     * 虚拟表注释
     */
    @Schema(description = "虚拟表注释")
    private String virtualComment;

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
