package com.cloudflow.common.datascope;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ServiceException;

/**
 * 数据权限工具类
 * 
 * 作用：
 * - 标准化 DataScope 的构建（列表/计数/仅本人/跳过过滤），避免在 Service 层重复手写行级权限逻辑。
 * - 统一非标准字段名（如部门列/用户列）配置入口，减少拦截器默认列名不匹配导致的过滤失败。
 * - Mapper 方法显式传入 @Param("dataScope") DataScope，拦截器将自动改写 SQL 完成行级过滤。
 * - 当 COUNT 与列表分页的 SQL 结构不同或存在复杂 JOIN 时，应分离 list 与 count 的 DataScope（func 不同）。
 *
 * 使用示例：
 * 
 * 1）标准分页 + 行级权限（默认列名）
 *   mapper.selectPageByDataScope(pageArg, query, DataScopeUtils.listScope());
 *
 * 2）指定权限列名（例如部门列为 store_id，用户列为 owner_id）：
 *   mapper.selectPageByDataScope(pageArg, query, DataScopeUtils.listScope("store_id", "owner_id"));
 *
 * 3）仅本人数据：
 *   mapper.selectPageByDataScope(pageArg, query, DataScopeUtils.onlySelf("owner_id"));
 *
 * 4）跳过行级过滤（例如 TOC 用户或已在业务确定无需数据范围限制）：
 *   mapper.selectListByDataScope(query, DataScopeUtils.skip());
 *
 * @author CloudFlow
 */
public final class DataScopeUtils {

    private DataScopeUtils() {
        // 工具类，禁止实例化
    }

    /**
     * 构造列表查询用的 DataScope（func=ALL）。
     * 使用默认的列名：dept_id 和 user_id
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
     * 拦截器会将原 SQL 包裹为 SELECT COUNT(1) FROM (... )。
     * 使用默认的列名：dept_id 和 user_id
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
     * @param userColumn 用户列名（默认拦截器为 user_id）
     * @return DataScope 列表查询数据权限对象
     */
    public static DataScope listScope(String deptColumn, String userColumn) {
        DataScope scope = listScope();
        scope.setScopeDeptName(deptColumn);
        scope.setScopeUserIdName(userColumn);
        return scope;
    }

    /**
     * 构造计数查询用 DataScope，并自定义部门列与用户列名。
     * 
     * @param deptColumn 部门列名（默认拦截器为 dept_id）
     * @param userColumn 用户列名（默认拦截器为 user_id）
     * @return DataScope 计数查询数据权限对象
     */
    public static DataScope countScope(String deptColumn, String userColumn) {
        DataScope scope = countScope();
        scope.setScopeDeptName(deptColumn);
        scope.setScopeUserIdName(userColumn);
        return scope;
    }

    /**
     * 仅本人数据：自动从当前登录用户提取用户ID并设置到 DataScope。
     * 默认列名（user_id），如需自定义请使用 onlySelf(userColumn)。
     * 
     * @return DataScope 仅本人数据权限对象
     */
    public static DataScope onlySelf() {
        DataScope scope = listScope();
        scope.setUserId(UserContext.getUserId());
        return scope;
    }

    /**
     * 仅本人数据：自动从当前登录用户提取用户ID并设置到 DataScope。
     * 自定义用户列名。
     * 
     * @param userColumn 用户列名（默认拦截器为 user_id）
     * @return DataScope 仅本人数据权限对象
     */
    public static DataScope onlySelf(String userColumn) {
        DataScope scope = onlySelf();
        scope.setScopeUserIdName(userColumn);
        return scope;
    }

    /**
     * 非全部权限时仅按用户列过滤。
     *
     * @param userColumn 用户列名
     * @return DataScope 仅用户列数据权限对象
     */
    public static DataScope userOnlyScope(String userColumn) {
        DataScope scope = listScope(null, userColumn);
        scope.setUserOnly(true);
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

    /**
     * M0-6: 断言当前用户拥有实体所有权。
     * <p>
     * 用于写路径（update / delete）前置校验，替换业务模块里"靠前端传 id"的模式。
     * 失败抛 ServiceException("ERR.NO_PERMISSION", 403)。
     * <p>
     * 示例：
     * <pre>
     * public void updateClaim(BizExpenseClaim claim) {
     *     DataScopeUtils.assertOwnership(claim.getUserId(), "报销单");
     *     // 业务逻辑
     * }
     * </pre>
     *
     * @param ownerUserId 实体所有者用户 ID
     * @param entityName  实体名称（用于错误提示）
     * @throws ServiceException 当前用户不是所有者时抛出 403
     */
    public static void assertOwnership(Long ownerUserId, String entityName) {
        Long currentUserId = UserContext.getUserId();
        if (currentUserId == null) {
            throw new ServiceException("ERR.NO_PERMISSION", 403);
        }
        if (!currentUserId.equals(ownerUserId)) {
            throw new ServiceException("无权操作该" + entityName, 403);
        }
    }

    /**
     * M0-6: 断言当前用户拥有实体所有权（通过 getter 获取 ownerUserId）。
     * <p>
     * 适用于实体对象有 getUserId() / getOwnerId() / getApplicantId() 等方法的场景。
     * <p>
     * 示例：
     * <pre>
     * public void updateClaim(BizExpenseClaim claim) {
     *     DataScopeUtils.assertOwnership(claim, BizExpenseClaim::getUserId, "报销单");
     *     // 业务逻辑
     * }
     * </pre>
     *
     * @param entity         实体对象
     * @param ownerIdGetter  获取所有者 ID 的 getter（如 BizExpenseClaim::getUserId）
     * @param entityName     实体名称（用于错误提示）
     * @param <T>            实体类型
     * @throws ServiceException 当前用户不是所有者时抛出 403
     */
    public static <T> void assertOwnership(T entity, java.util.function.Function<T, Long> ownerIdGetter, String entityName) {
        if (entity == null) {
            throw new ServiceException("实体不存在", 404);
        }
        Long ownerUserId = ownerIdGetter.apply(entity);
        assertOwnership(ownerUserId, entityName);
    }
}
