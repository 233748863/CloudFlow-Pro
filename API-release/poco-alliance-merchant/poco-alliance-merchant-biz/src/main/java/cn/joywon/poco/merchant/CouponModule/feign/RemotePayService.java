package cn.joywon.poco.merchant.CouponModule.feign;

import cn.joywon.poco.common.core.util.R;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import java.util.Map;

@FeignClient(contextId = "remotePayService", value = "poco-pay-platform")
public interface RemotePayService {

    @PostMapping("/profit-sharing/submit")
    R<String> submitProfitSharing(@RequestBody Map<String, String> params);
}
