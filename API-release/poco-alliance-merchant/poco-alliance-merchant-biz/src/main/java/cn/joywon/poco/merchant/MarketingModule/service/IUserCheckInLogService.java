package cn.joywon.poco.merchant.MarketingModule.service;

import cn.joywon.poco.merchant.MarketingModule.entity.UserCheckInLog;
import com.baomidou.mybatisplus.extension.service.IService;

public interface IUserCheckInLogService extends IService<UserCheckInLog> {


    /**
     * 检查用户是否已签到
     *
     * @param userId 用户ID
     * @return 连续签到天数
     */
    Integer checkHasSignIn(Long userId);


}