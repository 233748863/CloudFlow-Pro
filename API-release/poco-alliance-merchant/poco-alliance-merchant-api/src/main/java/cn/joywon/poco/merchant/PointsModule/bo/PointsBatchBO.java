package cn.joywon.poco.merchant.PointsModule.bo;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class PointsBatchBO {

    // 积分批次ID
    private Long batchId;

    // 批次剩余积分
    private Integer remainingPoints;

    // 批次积分明细
    private String batchDetail;

    // 批次创建时间
    private LocalDateTime createdTime;

    // 批次已用积分
    private Integer usedPoints;

    // 累计剩余积分
    private Integer cumulativeRemain;

}