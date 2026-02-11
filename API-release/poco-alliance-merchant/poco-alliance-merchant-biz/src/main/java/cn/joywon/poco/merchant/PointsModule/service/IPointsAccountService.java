package cn.joywon.poco.merchant.PointsModule.service;

import cn.joywon.poco.merchant.PointsModule.definition.PointsEnum;
import cn.joywon.poco.merchant.PointsModule.entity.PointsAccount;
import com.baomidou.mybatisplus.extension.service.IService;

import java.util.List;

public interface IPointsAccountService extends IService<PointsAccount> {


    /**
     * 创建积分账户
     *
     * @param ownerId   用户/商家ID
     * @param ownerType 积分账户类型
     * @return 积分账户ID
     */
    Long createPointsAccount(Long ownerId, PointsEnum ownerType);


    /**
     * 删除积分账户
     *
     * @param ids 积分账户ID列表
     */
    void deletePointsAccounts(List<Long> ids);


    /**
     * 更新积分账户余额
     *
     * @param pointsAccountId 积分账户ID
     * @param changePoints    积分变动数
     */
    void updatePointsAccountBalance(Long pointsAccountId, Integer changePoints);


    /**
     * 更新积分账户余额
     *
     * @param ownerId      用户/商家ID
     * @param ownerType    积分账户类型
     * @param changePoints 积分变动数
     */
    void updatePointsAccountBalance(Long ownerId, PointsEnum ownerType, Integer changePoints);


}