package com.cloudflow.auth.service.remote;

import com.cloudflow.common.core.domain.R;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cloud.openfeign.FallbackFactory;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class RemoteHrEmployeeFallbackFactory implements FallbackFactory<RemoteHrEmployeeService> {

    @Override
    public RemoteHrEmployeeService create(Throwable cause) {
        return userId -> {
            log.warn("查询 HR 员工生日信息失败, userId={}", userId, cause);
            return R.fail("HR 员工信息服务暂不可用");
        };
    }
}
