package com.cloudflow.common.datascope;

import com.baomidou.mybatisplus.core.toolkit.PluginUtils;
import lombok.Setter;
import org.apache.ibatis.executor.Executor;
import org.apache.ibatis.mapping.BoundSql;
import org.apache.ibatis.mapping.MappedStatement;
import org.apache.ibatis.session.ResultHandler;
import org.apache.ibatis.session.RowBounds;

import java.util.List;
import java.util.Map;

/**
 * 数据权限MyBatis拦截器实现
 * 自动在SQL中添加数据权限过滤条件
 * 
 * @author CloudFlow
 * @date 2026-02-12
 */
public class DataScopeInnerInterceptor implements DataScopeInterceptor {

    /**
     * 数据权限处理器
     */
    @Setter
    private DataScopeHandle dataScopeHandle;
    
    /**
     * 构造函数
     * 
     * @param dataScopeHandle 数据权限处理器
     */
    public DataScopeInnerInterceptor(DataScopeHandle dataScopeHandle) {
        this.dataScopeHandle = dataScopeHandle;
    }

    @Override
    public void beforeQuery(Executor executor, MappedStatement ms, Object parameter, RowBounds rowBounds,
                            ResultHandler resultHandler, BoundSql boundSql) {
        // 获取MyBatis-Plus的BoundSql包装对象
        PluginUtils.MPBoundSql mpBs = PluginUtils.mpBoundSql(boundSql);

        // 获取原始SQL
        String originalSql = boundSql.getSql();
        Object parameterObject = boundSql.getParameterObject();

        // 查找参数中是否包含DataScope对象
        DataScope dataScope = findDataScopeObject(parameterObject);
        if (dataScope == null) {
            // 没有DataScope参数,不进行权限过滤
            return;
        }

        // 检查是否强制跳过数据权限过滤
        if (dataScope.isSkip()) {
            return;
        }

        // 调用权限处理器计算数据权限范围
        // 如果返回true,表示用户有全部数据权限,不需要过滤
        if (dataScopeHandle != null && dataScopeHandle.calcScope(dataScope)) {
            // 对于COUNT查询,需要包装一下
            if (DataScopeFuncEnum.COUNT.equals(dataScope.getFunc())) {
                mpBs.sql(String.format("SELECT %s FROM (%s) temp_data_scope", 
                    dataScope.getFunc().getType(), originalSql));
            }
            return;
        }

        // 获取部门ID列表和用户ID
        List<Long> deptIds = dataScope.getDeptList();
        Long userId = dataScope.getUserId();

        // 构建带权限过滤的SQL
        String newSql = buildFilteredSql(originalSql, dataScope, deptIds, userId);
        
        // 更新SQL
        mpBs.sql(newSql);
    }

    /**
     * 构建带权限过滤的SQL
     * 
     * @param originalSql 原始SQL
     * @param dataScope 数据权限参数
     * @param deptIds 部门ID列表
     * @param userId 用户ID
     * @return 过滤后的SQL
     */
    private String buildFilteredSql(String originalSql, DataScope dataScope, 
                                    List<Long> deptIds, Long userId) {
        String funcType = dataScope.getFunc().getType();
        boolean hasUserColumn = dataScope.getScopeUserIdName() != null
            && !dataScope.getScopeUserIdName().trim().isEmpty();
        boolean hasDeptColumn = dataScope.getScopeDeptName() != null
            && !dataScope.getScopeDeptName().trim().isEmpty();
        
        // 1. 无数据权限限制,返回0条数据
        if ((deptIds == null || deptIds.isEmpty()) && userId == null) {
            return String.format("SELECT %s FROM (%s) temp_data_scope WHERE 1 = 2",
                funcType, originalSql);
        }
        
        // 2. 本人权限 + 部门权限
        if (userId != null && hasUserColumn && deptIds != null && !deptIds.isEmpty() && hasDeptColumn) {
            String deptIdsStr = deptIds.stream()
                .map(String::valueOf)
                .reduce((a, b) -> a + "," + b)
                .orElse("");
            return String.format(
                "SELECT %s FROM (%s) temp_data_scope WHERE temp_data_scope.%s = %d OR temp_data_scope.%s IN (%s)",
                funcType, originalSql, 
                dataScope.getScopeUserIdName(), userId,
                dataScope.getScopeDeptName(), deptIdsStr);
        }
        
        // 3. 仅本人权限
        if (userId != null && hasUserColumn) {
            return String.format(
                "SELECT %s FROM (%s) temp_data_scope WHERE temp_data_scope.%s = %d",
                funcType, originalSql, 
                dataScope.getScopeUserIdName(), userId);
        }
        
        // 4. 仅部门权限
        if (deptIds != null && !deptIds.isEmpty() && hasDeptColumn) {
            String deptIdsStr = deptIds.stream()
                .map(String::valueOf)
                .reduce((a, b) -> a + "," + b)
                .orElse("");
            return String.format(
                "SELECT %s FROM (%s) temp_data_scope WHERE temp_data_scope.%s IN (%s)",
                funcType, originalSql, 
                dataScope.getScopeDeptName(), deptIdsStr);
        }
        
        return String.format("SELECT %s FROM (%s) temp_data_scope WHERE 1 = 2",
            funcType, originalSql);
    }

    /**
     * 从参数对象中查找DataScope对象
     * 
     * @param parameterObj 参数对象
     * @return DataScope对象,如果未找到则返回null
     */
    private DataScope findDataScopeObject(Object parameterObj) {
        if (parameterObj == null) {
            return null;
        }
        
        // 直接是DataScope对象
        if (parameterObj instanceof DataScope) {
            return (DataScope) parameterObj;
        }
        
        // 从Map参数中查找
        if (parameterObj instanceof Map) {
            Map<?, ?> paramMap = (Map<?, ?>) parameterObj;
            for (Object value : paramMap.values()) {
                if (value instanceof DataScope) {
                    return (DataScope) value;
                }
            }
        }
        
        return null;
    }
}
