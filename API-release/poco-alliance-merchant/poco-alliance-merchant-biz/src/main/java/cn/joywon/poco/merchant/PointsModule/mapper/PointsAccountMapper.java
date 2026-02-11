package cn.joywon.poco.merchant.PointsModule.mapper;

import cn.joywon.poco.merchant.PointsModule.entity.PointsAccount;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface PointsAccountMapper extends BaseMapper<PointsAccount> {


    /**
     * 批量删除积分账户
     *
     * @param ids 积分账户ID列表
     * @return 受影响行数
     */
    int deletePointsAccounts(@Param("ids") List<Long> ids);


}