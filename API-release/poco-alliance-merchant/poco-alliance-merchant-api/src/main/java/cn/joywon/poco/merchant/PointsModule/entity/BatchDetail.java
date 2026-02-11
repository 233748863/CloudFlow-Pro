package cn.joywon.poco.merchant.PointsModule.entity;

import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 积分批次表.积分批次详情实体
 */
@Data
public class BatchDetail {

    /**
     * 关联业务ID
     */
    private Long biz_id;

    /**
     * 积分获取日期
     */
    private LocalDate date;

    /**
     * 积分数量
     */
    private Integer points;

    /**
     * 过期时间
     */
    private LocalDateTime expire_date;

    /**
     * 剩余数量
     */
    private Integer remaining;

}