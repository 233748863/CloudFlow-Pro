package cn.joywon.poco.merchant.MemberModule.mapper;

import cn.joywon.poco.merchant.MemberModule.entity.User;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface UserMapper extends BaseMapper<User> {


    /**
     * 删除用户
     *
     * @param userIds 用户ID列表
     * @return 受影响行数
     */
    int deleteUsers(@Param("ids") List<Long> userIds);


    /**
     * 获取用户关联的积分账户ID列表
     *
     * @param ids 用户ID列表
     * @return 积分账户ID列表
     */
    List<Long> getUsersPointAccountIds(@Param("ids") List<Long> ids);


}