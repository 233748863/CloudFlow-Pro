package cn.joywon.poco.merchant.OrderModule.mapper;

import cn.joywon.poco.common.data.datascope.PocoBaseMapper;
import cn.joywon.poco.merchant.OrderModule.entity.OrderDeliveryRecord;
import cn.joywon.poco.merchant.OrderModule.vo.OrderDeliveryRecordVO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface OrderDeliveryRecordMapper extends PocoBaseMapper<OrderDeliveryRecord> {

    /**
     * 根据订单ID查询最新配送记录
     */
    OrderDeliveryRecordVO getLatestDeliveryRecordByOrderId(@Param("orderId") Long orderId);
}