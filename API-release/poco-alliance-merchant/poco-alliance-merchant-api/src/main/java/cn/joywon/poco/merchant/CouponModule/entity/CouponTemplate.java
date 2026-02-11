package cn.joywon.poco.merchant.CouponModule.entity;

import cn.joywon.poco.merchant.CouponModule.definition.CouponStatusEnum;
import cn.joywon.poco.merchant.CouponModule.definition.CouponTemplateEnum;
import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.io.Serial;
import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 优惠券模板表实体
 */
@Data
@TableName("coupon_templates")
public class CouponTemplate implements Serializable {

    @Serial
    private static final long serialVersionUID = 1559316076719637937L;

    /**
     * 优惠券模板ID
     */
    @TableId(type = IdType.AUTO)
    private Long id;

    /**
     * 所属商家ID(为NULL表示平台券)
     */
    private Long merchantId;

    /**
     * 优惠券logoURL
     */
    private String logoUrl;

    /**
     * 适用范围
     * GLOBAL(全平台), MERCHANT(商家), STORE(门店)
     */
    private CouponTemplateEnum scope;

    /**
     * 适用门店ID列表(JSON格式)
     */
    private String applicableStores;

    /**
     * 适用商品SKU列表(JSON格式)
     */
    private String applicableSkus;

    /**
     * 优惠券类型: CASH(满减/代金), DISCOUNT(折扣)
     */
    private CouponTemplateEnum type;

    /**
     * 优惠券模板名称
     */
    private String name;

    /**
     * 优惠券简介
     */
    private String summary;

    /**
     * 优惠券详情描述
     */
    private String description;

    /**
     * 折扣金额(单位: 元, 2位小数), type=CASH时有效
     */
    private BigDecimal discountAmount;

    /**
     * 折扣率(0.00-1.00), 如0.85代表85折, type=DISCOUNT时有效
     */
    private BigDecimal discountRate;

    /**
     * 最低消费金额门槛(单位: 元, 2位小数)
     */
    private BigDecimal minSpendAmount;

    /**
     * 优惠券最大可抵扣金额(单位: 元, 2位小数)
     */
    private BigDecimal maxDeductibleAmount;

    /**
     * 优惠券发放总量, -1为不限量
     */
    private Integer totalQuantity;

    /**
     * 已发放优惠券数量
     */
    private Integer issuedQuantity;

    /**
     * 每个用户领取优惠券的上限
     */
    private Integer receiveLimitPerUser;

    /**
     * 发放开始时间
     */
    private LocalDateTime issueStartTime;

    /**
     * 发放结束时间
     */
    private LocalDateTime issueEndTime;

    /**
     * 优惠券有效期类型
     * DYNAMIC_DAYS(领取后生效), FIXED_DATE_RANGE(固定日期范围)
     */
    private CouponTemplateEnum validityType;

    /**
     * 优惠券生效开始时间, validityType=FIXED_DATE_RANGE时有效
     */
    private LocalDateTime validStartTime;

    /**
     * 优惠券生效结束时间, validityType=FIXED_DATE_RANGE时有效
     */
    private LocalDateTime validEndTime;

    /**
     * 优惠券领取后有效天数
     */
    private Integer validDaysFromReceive;

    /**
     * 优惠券审核状态
     * PENDING(待审核), REVISING(修改中), APPROVED(审核通过), REJECTED(审核拒绝)
     */
    private CouponStatusEnum couponStatus;

    /**
     * 审核时间
     */
    private LocalDateTime auditTime;

    /**
     * 审核人ID
     */
    private Long auditBy;

    /**
     * 审核意见
     */
    private String auditRemark;

    /**
     * 是否启用: true-启用; false-禁用
     */
    @TableField("is_enable")
    private Boolean enable;

    /**
     * 乐观锁版本号
     */
    @Version
    private Integer version;

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