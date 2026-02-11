package cn.joywon.poco.merchant.PointsModule.service;

import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.merchant.Common.page.PageQueryVO;
import cn.joywon.poco.merchant.PointsModule.dto.PointsAddChangeDTO;
import cn.joywon.poco.merchant.PointsModule.dto.PointsDedChangeDTO;
import cn.joywon.poco.merchant.PointsModule.dto.PointsFlowQueryDTO;
import cn.joywon.poco.merchant.PointsModule.vo.PointsBalanceVO;
import cn.joywon.poco.merchant.PointsModule.vo.PointsExpiredListVO;
import cn.joywon.poco.merchant.PointsModule.vo.PointsFlowListVO;

import java.util.List;

public interface IMerchantPointsService {


    /**
     * 商家积分增加
     *
     * @param dto 积分增加变动参数
     * @return 操作结果
     */
    R<?> changeAdd(PointsAddChangeDTO dto);


    /**
     * 商家积分扣减
     *
     * @param dto 积分扣减变动参数
     * @return 操作结果
     */
    R<?> changeDed(PointsDedChangeDTO dto);


    /**
     * 处理过期积分
     *
     * @return 操作结果
     */
    R<?> expiredCleanup();


    /**
     * 获取商家积分余额
     *
     * @return 查询结果
     */
    R<Integer> getBalance();


    /**
     * 获取商家积分余额详情
     *
     * @return 查询结果
     */
    R<PointsBalanceVO> getBalanceDetail();


    /**
     * 查询商家积分变动记录
     *
     * @param dto 积分变动记录查询参数
     * @return 查询结果
     */
    R<PageQueryVO<PointsFlowListVO>> queryPointsFlow(PointsFlowQueryDTO dto);


    /**
     * 获取商家积分过期记录
     *
     * @return 查询结果
     */
    R<List<PointsExpiredListVO>> getPointsExpiredLog();


}