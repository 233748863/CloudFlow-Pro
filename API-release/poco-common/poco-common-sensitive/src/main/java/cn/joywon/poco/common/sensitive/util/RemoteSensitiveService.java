package cn.joywon.poco.common.sensitive.util;

import cn.joywon.poco.common.core.constant.ServiceNameConstants;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.feign.annotation.NoToken;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

import java.util.List;

/**
 * @author poco
 * @date 2024/7/7
 */
@FeignClient(contextId = "remoteSensitiveService", value = ServiceNameConstants.UPMS_SERVICE)
public interface RemoteSensitiveService {

    @NoToken
    @GetMapping("/sysSensitiveWord/remote/list/{type}")
    R<List<String>> list(@PathVariable String type);
}
