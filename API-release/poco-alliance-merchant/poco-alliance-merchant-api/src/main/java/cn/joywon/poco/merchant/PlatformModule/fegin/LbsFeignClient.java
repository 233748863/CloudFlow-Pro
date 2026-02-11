package cn.joywon.poco.merchant.PlatformModule.fegin;

import cn.joywon.poco.common.core.constant.ServiceNameConstants;
import cn.joywon.poco.common.core.util.R;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

import java.util.Map;

@FeignClient(contextId = "lbsFeignClient", value = ServiceNameConstants.MERCHANT_SERVICE)
public interface LbsFeignClient {


    /**
     * lbs解析接口
     *
     * @param address 详细地址
     * @return 解析后的地理位置信息
     */
    @GetMapping("/platform/lbs/parse/address")
    R<Map<String, String>> lbsParse(@RequestParam String address);


}