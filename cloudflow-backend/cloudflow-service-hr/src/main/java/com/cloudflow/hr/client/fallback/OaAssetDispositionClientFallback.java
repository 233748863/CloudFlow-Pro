package com.cloudflow.hr.client.fallback;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.client.OaAssetDispositionClient;
import com.cloudflow.hr.client.vo.HrEmployeeAssetDisposition;
import org.springframework.stereotype.Component;

@Component
public class OaAssetDispositionClientFallback implements OaAssetDispositionClient {
    @Override public R<HrEmployeeAssetDisposition> inspect(Long employeeId, Long assetId) { return R.fail("OA资产处置尚未核实，请在服务恢复后重试"); }
}
