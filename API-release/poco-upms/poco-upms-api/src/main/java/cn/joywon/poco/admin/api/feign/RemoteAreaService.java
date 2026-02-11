package cn.joywon.poco.admin.api.feign;

import cn.joywon.poco.common.core.constant.ServiceNameConstants;
import cn.joywon.poco.common.core.util.R;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

import java.util.List;

@FeignClient(contextId = "remoteAreaService", value = ServiceNameConstants.UPMS_SERVICE)
public interface RemoteAreaService {


    @GetMapping("/sysArea/locations/byCodes")
    R<List<String>> getLocationsByCodes(@RequestParam("codes") List<Long> adCodes);



}