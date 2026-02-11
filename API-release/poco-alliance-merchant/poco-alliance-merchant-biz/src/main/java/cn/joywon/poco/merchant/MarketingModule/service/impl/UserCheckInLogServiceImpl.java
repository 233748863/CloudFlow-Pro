package cn.joywon.poco.merchant.MarketingModule.service.impl;

import cn.joywon.poco.merchant.MarketingModule.entity.UserCheckInLog;
import cn.joywon.poco.merchant.MarketingModule.mapper.UserCheckInLogMapper;
import cn.joywon.poco.merchant.MarketingModule.service.IUserCheckInLogService;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import org.springframework.stereotype.Service;

import java.time.LocalDate;

@Service
public class UserCheckInLogServiceImpl extends
        ServiceImpl<UserCheckInLogMapper, UserCheckInLog> implements IUserCheckInLogService {


    /**
     * 检查用户是否已签到
     *
     * @param userId 用户ID
     * @return 连续签到天数
     */
    @Override
    public Integer checkHasSignIn(Long userId) {
        UserCheckInLog checkInLog = lambdaQuery()
                .eq(UserCheckInLog::getUserId, userId)
                .gt(UserCheckInLog::getCreatedTime, LocalDate.now().atStartOfDay())
                .one();
        return checkInLog == null ? null : checkInLog.getContinuousDays();
    }


}