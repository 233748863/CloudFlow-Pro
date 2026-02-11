package cn.joywon.poco.merchant.MemberModule.service;

import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.merchant.MemberModule.dto.UserSyncDTO;
import cn.joywon.poco.merchant.MemberModule.entity.User;
import com.baomidou.mybatisplus.extension.service.IService;

public interface IUserService extends IService<User> {


    /**
     * 同步添加用户
     *
     * @param dto 用户同步参数
     * @return 操作结果
     */
    R<?> addUser(UserSyncDTO dto);


    /**
     * 同步更新用户
     *
     * @param dto 用户同步参数
     * @return 响应结果
     */
    R<?> updateUser(UserSyncDTO dto);


    R<?> deleteUser(Long[] ids);
}