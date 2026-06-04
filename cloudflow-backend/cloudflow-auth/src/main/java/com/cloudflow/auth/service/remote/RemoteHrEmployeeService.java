package com.cloudflow.auth.service.remote;

import com.cloudflow.common.core.domain.R;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

@FeignClient(
        name = "cloudflow-service-hr",
        path = "/inner/hr",
        contextId = "authRemoteHrEmployeeService",
        fallbackFactory = RemoteHrEmployeeFallbackFactory.class
)
public interface RemoteHrEmployeeService {

    @GetMapping("/employees/by-user/{userId}")
    R<RemoteHrEmployeeSummaryVO> getEmployeeByUserId(@PathVariable("userId") Long userId);
}
