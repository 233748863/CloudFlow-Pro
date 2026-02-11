package cn.joywon.poco.merchant.MerchantModule.entity;

import cn.joywon.poco.merchant.MerchantModule.definition.AuditStatusEnum;
import cn.joywon.poco.merchant.MerchantModule.definition.BusinessStatusEnum;
import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.io.Serial;
import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 门店审核信息表实体
 */
@Data
@TableName("store_audit")
public class StoreAudit implements Serializable {

    @Serial
    private static final long serialVersionUID = 3140457642145666452L;

    /**
     * ID
     */
    @TableId(type = IdType.AUTO)
    private Long id;

    /**
     * 商户ID
     */
    private Long merchantId;

    /**
     * 行业ID
     */
    private Long industryId;

    /**
     * 门店ID
     */
    private Long storeId;

    /**
     * 门店名称
     */
    private String name;

    /**
     * 门店简介
     */
    private String description;

    /**
     * 所在地区
     */
    private String location;

    /**
     * 详细地址
     */
    private String addressDetail;

    /**
     * 门店联系电话
     */
    private String phone;

    /**
     * 门店logo
     */
    private String logoUrl;

    /**
     * 门店图片列表(JSON格式)
     */
    private String images;

    /**
     * 营业时间
     */
    private String businessHours;

    /**
     * 经度
     */
    private BigDecimal longitude;

    /**
     * 纬度
     */
    private BigDecimal latitude;

    /**
     * 区域编码
     */
    private String regionCode;

    /**
     * 门店营业执照号
     */
    private String licenseNo;

    /**
     * 营业执照图片URL列表
     */
    private String licenseImages;

    /**
     * 营业状态:
     * OPEN-营业中; CLOSED-已关店; RESTING-休息中
     */
    private BusinessStatusEnum businessStatus;

    /**
     * 是否启用: true-启用; false-禁用
     */
    @TableField("is_enable")
    private Boolean enable;

    /**
     * 提交修改原因
     */
    private String modifyReason;

    /**
     * 审核状态
     */
    private AuditStatusEnum auditStatus;

    /**
     * 审核类型
     */
    private AuditStatusEnum auditType;

    /**
     * 审核备注
     */
    private String auditRemark;

    /**
     * 审核时间
     */
    private LocalDateTime auditTime;

    /**
     * 审核人ID
     */
    private Long auditBy;

    /**
     * 创建人ID
     */
    @TableField(fill = FieldFill.INSERT)
    private Long createdBy;

    /**
     * 创建时间
     */
    private LocalDateTime createdTime;

    /**
     * 更新人ID
     */
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private Long updatedBy;

    /**
     * 更新时间
     */
    private LocalDateTime updatedTime;

    /**
     * 删除标记
     */
    @TableField("is_deleted")
    @TableLogic(value = "false", delval = "true")
    private Boolean deleted;

    /**
     * 删除时间
     */
    private LocalDateTime deletedTime;

}