package com.cloudflow.oa.service.remote;

import com.cloudflow.common.core.domain.R;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cloud.openfeign.FallbackFactory;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class RemoteCrmWorkplaceFallbackFactory implements FallbackFactory<RemoteCrmWorkplaceService> {

    @Override
    public RemoteCrmWorkplaceService create(Throwable cause) {
        log.error("OA 调用 CRM 工作台聚合失败: {}", cause.getMessage());
        return () -> R.fail("CRM 工作台数据暂不可用");
    }
}
