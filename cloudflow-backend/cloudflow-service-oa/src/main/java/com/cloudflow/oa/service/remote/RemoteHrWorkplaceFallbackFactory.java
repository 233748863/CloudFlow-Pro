package com.cloudflow.oa.service.remote;

import com.cloudflow.common.core.domain.R;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cloud.openfeign.FallbackFactory;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class RemoteHrWorkplaceFallbackFactory implements FallbackFactory<RemoteHrWorkplaceService> {

    @Override
    public RemoteHrWorkplaceService create(Throwable cause) {
        log.error("OA 调用 HR 工作台提醒接口失败: {}", cause.getMessage());
        return (userId, expiringDays, limit) -> R.fail("HR 提醒数据暂不可用");
    }
}
