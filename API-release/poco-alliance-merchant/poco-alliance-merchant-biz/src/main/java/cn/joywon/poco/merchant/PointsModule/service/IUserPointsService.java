package cn.joywon.poco.merchant.PointsModule.service;

import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.merchant.PointsModule.dto.PointsAddChangeDTO;
import cn.joywon.poco.merchant.PointsModule.dto.PointsDedChangeDTO;
import cn.joywon.poco.merchant.PointsModule.vo.PointsBalanceVO;

public interface IUserPointsService {


    /**
     * 用户积分增加
     *
     * @param dto 积分增加参数
     * @return 操作结果
     */
    R<?> changeAdd(PointsAddChangeDTO dto);


    /**
     * 用户积分变动扣减
     *
     * @param dto 积分扣减参数
     * @return 操作结果
     */
    R<?> changeDed(PointsDedChangeDTO dto);


    /**
     * 处理过期积分
     *
     * @return 处理结果
     */
    R<?> expiredCleanup();


    /**
     * 获取用户积分余额详情
     *
     * @return 查询结果
     */
    R<PointsBalanceVO> getBalanceDetail();


}