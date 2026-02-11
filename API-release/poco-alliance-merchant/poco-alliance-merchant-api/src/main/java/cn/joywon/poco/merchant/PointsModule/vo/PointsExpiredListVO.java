package cn.joywon.poco.merchant.PointsModule.vo;

import lombok.Data;

import java.time.LocalDate;

@Data
public class PointsExpiredListVO {

    private String id;

    private Integer expiryPoints;

    private LocalDate expiryDate;

}