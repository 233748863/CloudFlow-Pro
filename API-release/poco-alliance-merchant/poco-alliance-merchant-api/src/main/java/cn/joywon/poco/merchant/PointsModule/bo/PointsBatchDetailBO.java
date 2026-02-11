package cn.joywon.poco.merchant.PointsModule.bo;

import lombok.Data;

import java.time.LocalDate;

@Data
// 积分批次明细业务数据
public class PointsBatchDetailBO {

    // 积分批次ID
    private Long batchId;

    // 关联业务ID
    private Long biz_id;

    // 积分获取日期
    private LocalDate date;

    // 积分明细数量
    private Integer points;

    // 积分过期时间
    private LocalDate expire_date;

    // 剩余积分数量
    private Integer remaining;

}