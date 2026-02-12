package com.cloudflow.common.datascope;

/**
 * 数据权限处理器接口
 * 用于计算用户的数据权限范围
 * 
 * @author CloudFlow
 * @date 2026-02-12
 */
public interface DataScopeHandle {

    /**
     * 计算数据权限范围
     * 根据当前用户的角色和权限配置,计算出用户可以访问的部门ID列表
     * 
     * @param dataScope 数据权限参数对象
     * @return true表示用户拥有全部数据权限,不需要过滤; false表示需要根据dataScope中的部门列表进行过滤
     */
    Boolean calcScope(DataScope dataScope);
}
