package cn.joywon.poco.merchant.PointsModule.bo;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class PointsFlowBatchRecordBO {

    private Long ownerId;

    private String ownerType;

    private String changeType;

    private List<PointsBatchDetailBO> pointsBatches;

}