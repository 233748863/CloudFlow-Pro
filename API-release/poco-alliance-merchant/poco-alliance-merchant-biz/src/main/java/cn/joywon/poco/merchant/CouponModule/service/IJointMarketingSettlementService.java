package cn.joywon.poco.merchant.CouponModule.service;

import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.merchant.Common.page.PageQueryVO;
import cn.joywon.poco.merchant.CouponModule.dto.JointMarketingRebateRecordPageDTO;
import cn.joywon.poco.merchant.CouponModule.dto.JointMarketingSettlementExecuteDTO;
import cn.joywon.poco.merchant.CouponModule.dto.SettlementRetryDTO;
import cn.joywon.poco.merchant.CouponModule.entity.JointMarketingRebateRecord;
import cn.joywon.poco.merchant.CouponModule.vo.SettlementStatusVO;

public interface IJointMarketingSettlementService {

    /**
     * 执行月度结算
     */
    void executeMonthlySettlement();

    /**
     * 手动执行结算
     */
    R<?> executeSettlement(JointMarketingSettlementExecuteDTO dto);

    /**
     * 重试失败的结算记录
     */
    R<?> retrySettlement(SettlementRetryDTO dto);

    /**
     * 取消结算任务
     */
    R<Boolean> cancelSettlement(String batchId);

    /**
     * 扫描过期的返利记录
     */
    void scanExpiredRebateRecords();

    /**
     * 分页查询返利记录
     */
    R<PageQueryVO<JointMarketingRebateRecord>> pageRebateRecord(JointMarketingRebateRecordPageDTO dto);

    /**
     * 获取结算任务状态
     */
    R<SettlementStatusVO> getSettlementStatus(String batchId);

}