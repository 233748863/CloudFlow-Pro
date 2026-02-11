package cn.joywon.poco.user.api.entity;

import cn.joywon.poco.common.core.util.TenantTable;
import com.baomidou.mybatisplus.annotation.*;
import com.baomidou.mybatisplus.extension.activerecord.Model;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.io.Serial;
import java.io.Serializable;
import java.time.LocalDateTime;

@Data
@TenantTable
@TableName("app_user_address")
@EqualsAndHashCode(callSuper = true)
@Schema(description = "用户地址表")
public class AppUserAddress extends Model<AppUserAddress> implements Serializable {
    @Serial
    private static final long serialVersionUID = -435689946387578929L;

    @TableId(type = IdType.ASSIGN_ID)
    @Schema(description = "addressId")
    private Long addressId;

    @Schema(description = "会员Id")
    private Long userId;

    @Schema(description = "省/直辖市/自治区")
    private String province;

    @Schema(description = "市")
    private String city;

    @Schema(description = "区县")
    private String district;

    @Schema(description = "详细地址")
    private String address;

    @Schema(description = "收货人姓名")
    private String username;

    @Schema(description = "联系电话")
    private String phone;

    @Schema(description = "是否默认地址")
    private Boolean isDefault;

    /**
     * 创建人
     */
    @Schema(description = "创建人")
    @TableField(fill = FieldFill.INSERT)
    private String createBy;

    /**
     * 修改人
     */
    @Schema(description = "修改人")
    @TableField(fill = FieldFill.UPDATE)
    private String updateBy;

    /**
     * 创建时间
     */
    @Schema(description = "创建时间")
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    /**
     * 修改时间
     */
    @Schema(description = "修改时间")
    @TableField(fill = FieldFill.UPDATE)
    private LocalDateTime updateTime;

    /**
     * 删除标记
     */
    @Schema(description = "删除标记,1:已删除,0:正常")
    @TableField(fill = FieldFill.INSERT)
    @TableLogic
    private String delFlag;

    /**
     * 所属租户
     */
    @Schema(description = "所属租户", hidden = true)
    private Long tenantId;

}
