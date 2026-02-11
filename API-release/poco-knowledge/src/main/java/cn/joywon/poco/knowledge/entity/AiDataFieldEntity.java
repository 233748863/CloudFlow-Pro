package cn.joywon.poco.knowledge.entity;

import com.baomidou.mybatisplus.annotation.*;
import com.baomidou.mybatisplus.extension.activerecord.Model;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.experimental.FieldNameConstants;

import java.time.LocalDateTime;

/**
 * AI 字段管理表
 *
 * @author poco
 * @date 2025-03-26 21:49:03
 */
@Data
@FieldNameConstants
@TableName("ai_data_field")
@EqualsAndHashCode(callSuper = true)
@Schema(description = "AI 字段管理表")
public class AiDataFieldEntity extends Model<AiDataFieldEntity> {


    /**
     * 主键ID
     */
    @TableId(type = IdType.ASSIGN_ID)
    @Schema(description = "主键ID")
    private Long fieldId;

    /**
     * 关联数据表
     */
    @Schema(description = "关联数据表")
    private Long tableId;


    /**
     * DB 类型
     */
    @Schema(description = "DB 类型")
    private String dbType;

    /**
     * 字段名称
     */
    @Schema(description = "字段名称")
    private String fieldName;

    /**
     * 字段备注
     */
    @Schema(description = "字段备注")
    private String fieldComment;

    /**
     * 虚拟注释
     */
    @Schema(description = "虚拟注释")
    private String virtualComment;

    /**
     * 字段类型
     */
    @Schema(description = "字段类型")
    private String fieldType;

    /**
     * 关联数据源名称
     */
    @Schema(description = "关联数据源名称")
    private String dsName;

    /**
     * 修正状态
     */
    @Schema(description = "修正状态")
    private String modifyStatus;

    /**
     * 修正时间
     */
    @Schema(description = "修正时间")
    private LocalDateTime modifyTime;

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
