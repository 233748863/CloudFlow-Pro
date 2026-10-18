package com.cloudflow.common.log.event;

import com.cloudflow.common.log.domain.SysApiErrorLog;
import org.springframework.context.ApplicationEvent;

public class ApiErrorLogEvent extends ApplicationEvent {
    public ApiErrorLogEvent(SysApiErrorLog entry) {
        super(entry);
    }
}
