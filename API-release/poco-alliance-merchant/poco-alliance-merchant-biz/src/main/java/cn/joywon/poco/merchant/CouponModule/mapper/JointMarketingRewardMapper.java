package cn.joywon.poco.merchant.CouponModule.mapper;

import cn.joywon.poco.common.data.datascope.PocoBaseMapper;
import cn.joywon.poco.merchant.CouponModule.entity.JointMarketingReward;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface JointMarketingRewardMapper extends PocoBaseMapper<JointMarketingReward> {

    /**
     * 增加已发放数量 (原子操作，防止超发)
     * @param id 奖励ID
     * @param count 增加数量
     * @return 更新行数 (0表示失败/库存不足)
     */
    int incrementIssuedCount(@Param("id") Long id, @Param("count") Integer count);
}
