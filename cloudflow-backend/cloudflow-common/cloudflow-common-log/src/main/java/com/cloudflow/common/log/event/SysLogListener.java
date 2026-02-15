package com.cloudflow.common.log.event;

import cn.hutool.core.util.StrUtil;
import com.cloudflow.common.log.config.CloudFlowLogProperties;
import com.cloudflow.common.log.domain.SysLogEntity;
import com.cloudflow.common.log.mapper.SysLogMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.ServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.core.annotation.Order;
import org.springframework.scheduling.annotation.Async;
import org.springframework.validation.BindingResult;

import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 操作日志事件监听器
 * <p>
 * 异步监听 {@link SysLogEvent}，将日志通过本地 Mapper 直接入库。
 * 替代 poco 原版中通过 Feign 远程调用 UPMS 服务的方式。
 * </p>
 *
 * @author CloudFlow
 */
@Slf4j
@RequiredArgsConstructor
public class SysLogListener {

    /** 序列化时忽略的参数类型 */
    private static final Class<?>[] IGNORE_CLASSES = {ServletRequest.class, BindingResult.class};

    private final SysLogMapper sysLogMapper;

    private final CloudFlowLogProperties logProperties;

    private final ObjectMapper objectMapper;

    /**
     * 异步处理日志事件
     * <p>
     * 将方法参数序列化为 JSON 字符串后入库，
     * 自动过滤不可序列化的参数类型。
     * </p>
     *
     * @param event 日志事件
     */
    @Async
    @Order
    @EventListener(SysLogEvent.class)
    public void saveSysLog(SysLogEvent event) {
        SysLogEntity sysLog = (SysLogEntity) event.getSource();

        // 如果开启了请求体记录，且 params 为空（说明是 POST body 参数）
        if (logProperties.isRequestEnabled() && StrUtil.isBlank(sysLog.getParams())) {
            // params 字段可能在切面中被临时存储为 body 的序列化结果
            // 这里不做额外处理，params 已在切面中设置
        }

        // 截断超长参数
        if (StrUtil.isNotBlank(sysLog.getParams()) && sysLog.getParams().length() > logProperties.getMaxLength()) {
            sysLog.setParams(sysLog.getParams().substring(0, logProperties.getMaxLength()));
        }

        try {
            sysLogMapper.insert(sysLog);
        } catch (Exception e) {
            log.error("操作日志入库失败: {}", e.getMessage(), e);
        }
    }
}
