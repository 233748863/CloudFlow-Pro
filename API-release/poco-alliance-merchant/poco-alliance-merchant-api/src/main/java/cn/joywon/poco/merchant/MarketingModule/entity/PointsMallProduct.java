package cn.joywon.poco.merchant.MarketingModule.entity;

import cn.joywon.poco.merchant.MarketingModule.definition.PointsMallProductEnum;
import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@TableName("points_mall_products")
public class PointsMallProduct {

    /**
     * 商品ID
     */
    @TableId(type = IdType.AUTO)
    private Long id;

    /**
     * 分类ID
     */
    private Long categoryId;

    /**
     * 商品名称
     */
    private String name;

    /**
     * 商品类型
     * VIRTUAL_COUPON(虚拟券), PHYSICAL_GOOD(实物)
     */
    private PointsMallProductEnum type;

    /**
     * 商品主图URL
     */
    private String mainImage;

    /**
     * 商品图片URL列表(JSON)
     */
    private String image;

    /**
     * 商品描述
     */
    private String description;

    /**
     * 兑换所需积分
     */
    private Integer pointsCost;

    /**
     * 售价金额
     */
    private BigDecimal cashPrice;

    /**
     * 库存(-1为无限库存)
     */
    private Integer stock;

    /**
     * 已兑换数量
     */
    private Integer exchangeCount;

    /**
     * 关联的优惠券模板ID
     */
    private Integer couponId;

    /**
     * 是否上架
     */
    private Boolean onShelf;

    /**
     * 商品状态
     */
    private PointsMallProductEnum status;

    /**
     * 排序序号(数值越小越靠前)
     */
    private Integer sortOrder;

    /**
     * 乐观锁版本号
     */
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
     * 修改人ID
     */
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private Long updatedBy;

    /**
     * 修改时间
     */
    private LocalDateTime updatedTime;

    /**
     * 删除标识
     */
    @TableField("is_deleted")
    @TableLogic(value = "0", delval = "1")
    private Boolean deleted;

    /**
     * 删除时间
     */
    private LocalDateTime deletedTime;

}