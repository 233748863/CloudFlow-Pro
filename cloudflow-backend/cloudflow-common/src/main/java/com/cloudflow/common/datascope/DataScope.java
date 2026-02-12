package com.cloudflow.common.datascope;

import lombok.Data;
import lombok.EqualsAndHashCode;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;

/**
 * 数据权限查询参数
 * 继承HashMap以便在MyBatis中作为参数传递
 * 
 * @author CloudFlow
 * @date 2026-02-12
 */
@Data
@EqualsAndHashCode(callSuper = true)
public class DataScope extends HashMap<String, Object> {

    /**
     * 跳过数据权限过滤标志
     * 设置为true时,将不进行任何数据权限过滤
     */
    private boolean skip = false;

    /**
     * 部门权限范围字段名称
     * 默认为dept_id,可根据实际表结构修改
     */
    private String scopeDeptName = "dept_id";

    /**
     * 本人权限范围字段名称
     * 默认为create_by,可根据实际表结构修改
     */
    private String scopeUserName = "create_by";

    /**
     * 具体的部门数据范围
     * 存储用户有权访问的部门ID列表
     */
    private List<Long> deptList = new ArrayList<>();

    /**
     * 具体查询的用户名
     * 用于本人权限范围的过滤
     */
    private String username;

    /**
     * 是否只查询本部门
     * true: 仅查询本部门数据
     * false: 查询本部门及下级部门数据
     */
    private Boolean isOnly = false;

    /**
     * SQL函数类型
     * 默认为SELECT *,可设置为COUNT(1)用于统计查询
     */
    private DataScopeFuncEnum func = DataScopeFuncEnum.ALL;

    /**
     * 静态工厂方法,创建DataScope实例
     * 
     * @return DataScope实例
     */
    public static DataScope of() {
        return new DataScope();
    }

    /**
     * 设置部门ID列表(链式调用)
     * 
     * @param deptIds 部门ID列表
     * @return 当前DataScope实例
     */
    public DataScope deptIds(List<Long> deptIds) {
        this.deptList = deptIds;
        return this;
    }

    /**
     * 设置是否只查询本部门(链式调用)
     * 
     * @param isOnly 是否只查询本部门
     * @return 当前DataScope实例
     */
    public DataScope only(boolean isOnly) {
        this.isOnly = isOnly;
        return this;
    }

    /**
     * 设置SQL函数类型(链式调用)
     * 
     * @param func SQL函数类型
     * @return 当前DataScope实例
     */
    public DataScope func(DataScopeFuncEnum func) {
        this.func = func;
        return this;
    }
}
