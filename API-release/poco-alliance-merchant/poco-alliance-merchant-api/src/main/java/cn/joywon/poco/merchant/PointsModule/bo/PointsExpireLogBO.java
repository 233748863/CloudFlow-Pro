package cn.joywon.poco.merchant.PointsModule.bo;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class PointsExpireLogBO {

    private Long ownerId;

    private String ownerType;

    private List<PointsBatchDetailBO> expiredPoints;

}