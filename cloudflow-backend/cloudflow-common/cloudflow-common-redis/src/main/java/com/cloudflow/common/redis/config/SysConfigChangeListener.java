package com.cloudflow.common.redis.config;

/**
 * Listener for local runtime objects that need to react to sys_config changes.
 */
public interface SysConfigChangeListener {

    void onSysConfigChanged(SysConfigChangeEvent event);
}
