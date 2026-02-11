package cn.joywon.poco.knowledge.entity;

import com.baomidou.mybatisplus.annotation.*;
import com.baomidou.mybatisplus.extension.activerecord.Model;
import cn.joywon.poco.common.core.util.TenantTable;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDateTime;

/**
 * AI功能
 *
 * @author poco
 * @date 2024-07-31 15:39:33
 */
@Data
@TenantTable
@TableName("ai_func")
@EqualsAndHashCode(callSuper = true)
@Schema(description = "AI功能")
public class AiFuncEntity extends Model<AiFuncEntity> {

	/**
	 * 主键ID
	 */
	@TableId(type = IdType.ASSIGN_ID)
	@Schema(description = "主键ID")
	private Long id;

	/**
	 * 函数名称
	 */
	@Schema(description = "函数名称")
	private String funcName;

	/**
	 * 函数标题
	 */
	@Schema(description = "函数标题")
	private String funcTitle;

	/**
	 * 欢迎语
	 */
	@Schema(description = "欢迎语")
	private String welcomeMsg;

	/**
	 * 函数描述
	 */
	@Schema(description = "函数描述")
	private String funcDesc;

	/**
	 * 字段信息
	 */
	@Schema(description = "字段信息")
	private String columnInfo;

	/**
	 * 函数状态
	 */
	@Schema(description = "函数状态")
	private String funcStatus;

	/**
	 * 流程配置
	 */
	@Schema(description = "流程配置")
	private String flowJson;

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
	 * 删除标记
	 */
	@TableLogic
	@TableField(fill = FieldFill.INSERT)
	@Schema(description = "删除标记")
	private String delFlag;

	/**
	 * 租户ID
	 */
	@Schema(description = "租户ID")
	private Long tenantId;

}
