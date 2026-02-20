package com.cloudflow.auth.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.cloudflow.auth.domain.SysConfig;

/**
 * 系统参数配置 Service 接口
 *
 * @author CloudFlow
 */
public interface ISysConfigService extends IService<SysConfig> {

    /**
     * 根据参数键名查询参数值
     *
     * @param configKey 参数键名
     * @return 参数键值
     */
    String selectConfigByKey(String configKey);

    /**
     * 校验参数键名是否唯一
     *
     * @param config 参数配置信息
     * @return true=唯一 false=不唯一
     */
    boolean checkConfigKeyUnique(SysConfig config);
}
