package com.cloudflow.oa.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.cloudflow.oa.domain.FrontendErrorLog;

/**
 * 前端错误日志 Service 接口
 */
public interface IFrontendErrorLogService extends IService<FrontendErrorLog> {

    /**
     * 接收并保存前端上报的错误
     *
     * @param errorLog 前端上报的错误数据
     * @param clientIp 客户端IP地址
     */
    void reportError(FrontendErrorLog errorLog, String clientIp);
}
