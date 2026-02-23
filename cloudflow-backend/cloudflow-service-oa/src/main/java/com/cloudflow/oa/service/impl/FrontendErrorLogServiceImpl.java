package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.oa.domain.FrontendErrorLog;
import com.cloudflow.oa.mapper.FrontendErrorLogMapper;
import com.cloudflow.oa.service.IFrontendErrorLogService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import com.fasterxml.jackson.annotation.JsonFormat;

/**
 * 前端错误日志 Service 实现
 * 接收前端上报的错误信息，异步写入数据库，避免阻塞前端请求
 */
@Slf4j
@Service
public class FrontendErrorLogServiceImpl extends ServiceImpl<FrontendErrorLogMapper, FrontendErrorLog>
        implements IFrontendErrorLogService {

    @Override
    public void reportError(FrontendErrorLog errorLog, String clientIp) {
        // 补充服务端信息
        errorLog.setClientIp(clientIp);
        errorLog.setCreateTime(LocalDateTime.now());

        // 尝试从上下文获取当前用户和租户信息（前端上报时可能未登录，所以用 try-catch 保护）
        try {
            Long userId = UserContext.getUserId();
            String userName = UserContext.getUserName();
            Long tenantId = UserContext.getTenantId();
            if (userId != null) {
                errorLog.setUserId(userId);
            }
            if (userName != null) {
                errorLog.setUserName(userName);
            }
            if (tenantId != null) {
                errorLog.setTenantId(tenantId);
            }
        } catch (Exception e) {
            // 获取用户上下文失败不影响错误日志记录
            log.debug("获取用户上下文失败，跳过用户信息填充: {}", e.getMessage());
        }

        // 解析前端传来的 timestamp 作为客户端时间
        // 前端传的是 ISO 格式字符串，已由 Jackson 自动反序列化到 clientTime 字段

        // 异步保存到数据库
        asyncSave(errorLog);
    }

    /**
     * 异步保存错误日志，避免阻塞前端上报请求
     * 保存失败仅记录日志，不抛出异常
     */
    @Async
    public void asyncSave(FrontendErrorLog errorLog) {
        try {
            this.save(errorLog);
            log.info("前端错误日志已记录: level={}, message={}, url={}",
                    errorLog.getLevel(), errorLog.getMessage(), errorLog.getUrl());
        } catch (Exception e) {
            // 数据库写入失败时降级为日志输出，确保不丢失错误信息
            log.error("前端错误日志写入数据库失败，降级为日志输出。原始错误: level={}, message={}, url={}, stack={}",
                    errorLog.getLevel(), errorLog.getMessage(), errorLog.getUrl(), errorLog.getStack(), e);
        }
    }
}
