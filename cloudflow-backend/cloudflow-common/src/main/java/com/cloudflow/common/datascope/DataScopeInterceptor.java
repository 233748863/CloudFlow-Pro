package com.cloudflow.common.datascope;

import com.baomidou.mybatisplus.extension.plugins.inner.InnerInterceptor;

/**
 * 数据权限拦截器接口
 * 继承MyBatis-Plus的InnerInterceptor接口
 * 
 * @author CloudFlow
 * @date 2026-02-12
 */
public interface DataScopeInterceptor extends InnerInterceptor {
    // 标记接口,用于类型识别
    // 具体实现由DataScopeInnerInterceptor提供
}
