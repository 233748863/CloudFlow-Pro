package com.cloudflow.common.datascope;

import com.cloudflow.common.core.utils.SecurityUtils;

/**
 * 数据权限工具类
 * 
 * 作用：
 * - 标准化 DataScope 的构建（列表/计数/仅本人/跳过过滤），避免在 Service 层重复手写行级权限逻辑。
 * - 统一非标准字段名（如部门列/用户列）配置入口，减少拦截器默认列名不匹配导致的过滤失败。
 * - Mapper 使用 CloudFlowBaseMapper 的扩展方法：selectListByScope / selectPageByScope / selectCountByScope。
 * - Service 层通过本工具构造合适的 DataScope 传入上述方法，拦截器将自动改写 SQL 完成行级过滤。
 * - 当 COUNT 与列表分页的 SQL 结构不同或存在复杂 JOIN 时，应分离 list 与 count 的 DataScope（func 不同）。
 *
 * 使用示例：
 * 
 * 1）标准分页 + 行级权限（默认列名）
 *   IPage<Entity> page = baseMapper.selectPageByScope(pageArg, wrapper, DataScopeUtils.listScope());
 *   Long total = baseMapper.selectCountByScope(wrapper, DataScopeUtils.countScope());
 *
 * 2）指定权限列名（例如部门列为 store_id，用户列为 created_by）：
 *   IPage<Entity> page = baseMapper.selectPageByScope(pageArg, wrapper, DataScopeUtils.listScope("store_id", "created_by"));
 *   Long total = baseMapper.selectCountByScope(wrapper, DataScopeUtils.countScope("store_id", "created_by"));
 *
 * 3）仅本人数据：
 *   IPage<Entity> page = baseMapper.selectPageByScope(pageArg, wrapper, DataScopeUtils.onlySelf("created_by"));
 *
 * 4）跳过行级过滤（例如 TOC 用户或已在业务确定无需数据范围限制）：
 *   List<Entity> list = baseMapper.selectListByScope(wrapper, DataScopeUtils.skip());
 *
 * @author CloudFlow
 */
public final class DataScopeUtils {

    private DataScopeUtils() {
        // 工具类，禁止实例化
    }

    /**
     * 构造列表查询用的 DataScope（func=ALL）。
     * 适用于 selectListByScope / selectPageByScope。
     * 使用默认的列名：dept_id 和 create_by
     * 
     * @return DataScope 列表查询数据权限对象
     */
    public static DataScope listScope() {
        DataScope scope = new DataScope();
        scope.setFunc(DataScopeFuncEnum.ALL);
        return scope;
    }

    /**
     * 构造计数查询用的 DataScope（func=COUNT）。
     * 适用于 selectCountByScope；拦截器会将原 SQL 包裹为 SELECT COUNT(1) FROM (... )。
     * 使用默认的列名：dept_id 和 create_by
     * 
     * @return DataScope 计数查询数据权限对象
     */
    public static DataScope countScope() {
        DataScope scope = new DataScope();
        scope.setFunc(DataScopeFuncEnum.COUNT);
        return scope;
    }

    /**
     * 构造列表查询用 DataScope，并自定义部门列与用户列名。
     * 
     * @param deptColumn 部门列名（默认拦截器为 dept_id）
     * @param userColumn 用户列名（默认拦截器为 create_by）
     * @return DataScope 列表查询数据权限对象
     */
    public static DataScope listScope(String deptColumn, String userColumn) {
        DataScope scope = listScope();
        scope.setScopeDeptName(deptColumn);
        scope.setScopeUserName(userColumn);
        return scope;
    }

    /**
     * 构造计数查询用 DataScope，并自定义部门列与用户列名。
     * 
     * @param deptColumn 部门列名（默认拦截器为 dept_id）
     * @param userColumn 用户列名（默认拦截器为 create_by）
     * @return DataScope 计数查询数据权限对象
     */
    public static DataScope countScope(String deptColumn, String userColumn) {
        DataScope scope = countScope();
        scope.setScopeDeptName(deptColumn);
        scope.setScopeUserName(userColumn);
        return scope;
    }

    /**
     * 仅本人数据：自动从当前登录用户提取用户名并设置到 DataScope，开启 isOnly。
     * 默认列名（create_by），如需自定义请使用 onlySelf(userColumn)。
     * 
     * @return DataScope 仅本人数据权限对象
     */
    public static DataScope onlySelf() {
        DataScope scope = listScope();
        if (SecurityUtils.getUsername() != null) {
            scope.setUsername(SecurityUtils.getUsername());
            scope.setIsOnly(true);
        }
        return scope;
    }

    /**
     * 仅本人数据：自动从当前登录用户提取用户名并设置到 DataScope，开启 isOnly。
     * 自定义用户列名。
     * 
     * @param userColumn 用户列名（默认拦截器为 create_by）
     * @return DataScope 仅本人数据权限对象
     */
    public static DataScope onlySelf(String userColumn) {
        DataScope scope = onlySelf();
        scope.setScopeUserName(userColumn);
        return scope;
    }

    /**
     * 跳过行级过滤：设置 skip 标记为 true，拦截器将不会添加数据权限条件。
     * 适用于特殊场景，如管理员查看所有数据、TOC 用户、或业务已确定无需数据范围限制的情况。
     * 
     * @return DataScope 跳过过滤的数据权限对象
     */
    public static DataScope skip() {
        DataScope scope = listScope();
        scope.setSkip(true);
        return scope;
    }
}
