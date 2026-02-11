package cn.joywon.poco.merchant.MarketingModule.entity;

import cn.joywon.poco.merchant.MarketingModule.definition.PointsMallProductEnum;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
public class PointMallProductSnapshot {

    // 商品名称
    private String name;

    // 商品主图
    private String mainImage;

    // 商品图片列表(JSON格式)
    private String image;

    // 兑换所需积分
    private Integer pointsCost;

    // 价格金额
    private BigDecimal cashPrice;

    // 商品类型
    private PointsMallProductEnum type;

    // 快照时间
    private LocalDateTime snapshotTime;

}