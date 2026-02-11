package cn.joywon.poco.merchant.PointsModule.bo;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class PointsFlowRecordBO {

    private Long ownerId;

    private String ownerType;

    private Long pointsBatchId;

    private Object pointsChangeDTO;

}