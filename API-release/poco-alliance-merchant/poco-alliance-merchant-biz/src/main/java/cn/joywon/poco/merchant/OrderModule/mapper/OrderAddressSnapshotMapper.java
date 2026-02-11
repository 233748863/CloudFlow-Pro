package cn.joywon.poco.merchant.OrderModule.mapper;

import cn.joywon.poco.common.data.datascope.PocoBaseMapper;
import cn.joywon.poco.merchant.OrderModule.entity.OrderAddressSnapshot;
import cn.joywon.poco.merchant.OrderModule.vo.OrderAddressSnapshotVO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface OrderAddressSnapshotMapper extends PocoBaseMapper<OrderAddressSnapshot> {

    /**
     * 根据订单ID查询最新地址快照
     */
    OrderAddressSnapshotVO getAddressSnapshotByOrderId(@Param("orderId") Long orderId);
}