package cn.joywon.poco.merchant.CouponModule.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.experimental.Accessors;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 联合营销规则表
 */
@Data
@EqualsAndHashCode(callSuper = false)
@Accessors(chain = true)
@TableName(value = "joint_marketing_rule", autoResultMap = true)
public class JointMarketingRule implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    /**
     * 计划ID
     */
    private Long planId;

    /**
     * 规则名称
     */
    private String name;

    /**
     * 触发商家ID列表
     */
    @TableField(typeHandler = JacksonTypeHandler.class)
    private List<Long> triggerMerchantIds;

    /**
     * 触发门店ID列表(NULL代表所有门店)
     */
    @TableField(typeHandler = JacksonTypeHandler.class)
    private List<Long> triggerStoreIds;

    /**
     * 触发事件: ORDER_COMPLETE-订单完成; ORDER_VERIFY-订单核销
     */
    private String triggerEvent;

    /**
     * 最低消费金额
     */
    private BigDecimal minOrderAmount;

    /**
     * 商品范围: ALL-全部; CATEGORY-指定分类; SPECIFIC-指定商品
     */
    private String productScopeType;

    /**
     * 指定商品/分类ID列表
     */
    @TableField(typeHandler = JacksonTypeHandler.class)
    private List<Long> productScopeIds;

    /**
     * 单用户每日触发上限
     */
    private Integer dailyLimitPerUser;

    /**
     * 规则总触发上限
     */
    private Integer totalLimit;

    /**
     * 状态: ACTIVE-启用; DISABLED-禁用
     */
    private String status;

    private Long createdBy;

    private LocalDateTime createdTime;

    private Long updatedBy;

    private LocalDateTime updatedTime;

    private Integer isDeleted;

    private LocalDateTime deletedTime;
}
