package com.cloudflow.common.log.event;

import com.cloudflow.common.log.domain.SysLogEntity;
import org.springframework.context.ApplicationEvent;

/**
 * 操作日志事件
 * <p>
 * 通过 Spring Event 机制异步传递日志数据，
 * 避免日志入库阻塞主业务流程。
 * </p>
 *
 * @author CloudFlow
 */
public class SysLogEvent extends ApplicationEvent {

    public SysLogEvent(SysLogEntity source) {
        super(source);
    }
}
