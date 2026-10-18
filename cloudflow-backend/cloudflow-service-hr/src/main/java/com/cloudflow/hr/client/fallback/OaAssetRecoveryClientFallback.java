package com.cloudflow.hr.client.fallback;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.client.OaAssetRecoveryClient;
import com.cloudflow.hr.client.vo.HrEmployeeAssetRecovery;
import org.springframework.stereotype.Component;

@Component
public class OaAssetRecoveryClientFallback implements OaAssetRecoveryClient {
    @Override
    public R<com.cloudflow.hr.client.vo.HrAssetReturnReminder> reminder(Long employeeId, Long userId, Long settlementId, Long assetId) {
        return R.fail("归还提醒记录暂无法读取，请稍后重新读取");
    }

    @Override
    public R<com.cloudflow.hr.client.vo.HrAssetReturnReminder> sendReminder(com.cloudflow.hr.client.vo.HrAssetReturnReminder.Request input) {
        return R.fail("归还提醒发送结果尚待核实，请读取最近提醒后再操作");
    }

    @Override
    public R<HrEmployeeAssetRecovery> outstanding(Long employeeId) {
        return R.fail("OA资产清单尚未核实，请在服务恢复后重试");
    }
}
