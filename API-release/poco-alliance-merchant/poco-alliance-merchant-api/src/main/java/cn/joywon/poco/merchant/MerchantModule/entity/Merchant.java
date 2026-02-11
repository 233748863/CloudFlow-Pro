package cn.joywon.poco.merchant.MerchantModule.entity;

import cn.joywon.poco.merchant.MerchantModule.definition.BusinessStatusEnum;
import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.io.Serial;
import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 商家信息表实体
 */
@Data
@TableName("merchants")
public class Merchant implements Serializable {

    @Serial
    private static final long serialVersionUID = -3076955640573736766L;

    /**
     * ID
     */
    @TableId(type = IdType.AUTO)
    private Long id;

    /**
     * 商家名称
     */
    private String name;

    /**
     * 商家logo
     */
    private String logoUrl;

    /**
     * 商家简介
     */
    private String description;

    /**
     * 商家联系人
     */
    private String contactName;

    /**
     * 商家联系电话
     */
    private String contactPhone;

    /**
     * 所在地区
     */
    private String location;

    /**
     * 商家地址
     */
    private String addressDetail;

    /**
     * 行业分类ID
     */
    private Long industryId;

    /**
     * 地区编码
     */
    private String regionCode;

    /**
     * 当前审核记录ID
     */
    private Long auditId;

    /**
     * 所属区域代理ID
     */
    private Long agentId;

    /**
     * 积分账户ID
     */
    private Long pointsAccount;

    /**
     * 法人姓名
     */
    private String legalPerson;

    /**
     * 平台抽成比例 (0-100)，默认 0
     */
    private BigDecimal commissionRate;

    /**
     * 子商户号 (微信支付服务商模式)
     */
    private String subMchId;

    /**
     * 营业执照编号
     */
    private String licenseNo;

    /**
     * 商家资质图片URL列表(JSON格式)
     */
    private String licenseImages;

    /**
     * 商家图片URL列表(JSON格式)
     */
    private String images;

    /**
     * 商家经营状态
     * PREPARING-准备中; OPERATING-经营中; SUSPENDED-停业中; TERMINATED-已结业
     */
    private BusinessStatusEnum businessStatus;

    /**
     * 商家是否启用: true-启用; false-禁用
     */
    @TableField("is_enable")
    private Boolean enable;

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