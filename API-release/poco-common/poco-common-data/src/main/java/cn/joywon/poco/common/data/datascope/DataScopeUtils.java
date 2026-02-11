package cn.joywon.poco.common.data.datascope;

import cn.joywon.poco.common.security.util.SecurityUtils;
import com.baomidou.mybatisplus.core.conditions.AbstractWrapper;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.toolkit.support.SFunction;

/**
 * 数据权限工具类
 *
 * 作用：
 * - 标准化 DataScope 的构建（列表/计数/仅本人/跳过过滤），避免在 Service 层重复手写行级权限逻辑。
 * - 统一非标准字段名（如部门列/用户列）配置入口，减少拦截器默认列名不匹配导致的过滤失败。
 * - 提供常用的商家约束（merchant_id）封装，便于在 Wrapper 上快速追加条件。
 *
 * 使用原则：
 * - Mapper 使用 PocoBaseMapper 的扩展方法：selectListByScope / selectPageByScope / selectCountByScope。
 * - Service 层通过本工具构造合适的 DataScope 传入上述方法，拦截器将自动改写 SQL 完成行级过滤。
 * - 当 COUNT 与列表分页的 SQL 结构不同或存在复杂 JOIN 时，应分离 list 与 count 的 DataScope（func 不同）。
 *
 * 典型用法示例：
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
 */
public final class DataScopeUtils {

    private DataScopeUtils() {}

    /**
     * 构造列表查询用的 DataScope（func=ALL）。
     * 适用于 selectListByScope / selectPageByScope。
     */
    public static DataScope listScope() {
        DataScope scope = new DataScope();
        scope.setFunc(DataScopeFuncEnum.ALL);
        return scope;
    }

    /**
     * 构造计数查询用的 DataScope（func=COUNT）。
     * 适用于 selectCountByScope；拦截器会将原 SQL 包裹为 SELECT COUNT(1) FROM (... )。
     */
    public static DataScope countScope() {
        DataScope scope = new DataScope();
        scope.setFunc(DataScopeFuncEnum.COUNT);
        return scope;
    }

    /**
     * 构造列表查询用 DataScope，并自定义部门列与用户列名。
     * @param deptColumn 部门列名（默认拦截器为 dept_id）
     * @param userColumn 用户列名（默认拦截器为 create_by）
     */
    public static DataScope listScope(String deptColumn, String userColumn) {
        DataScope scope = listScope();
        scope.setScopeDeptName(deptColumn);
        scope.setScopeUserName(userColumn);
        return scope;
    }

    /**
     * 构造计数查询用 DataScope，并自定义部门列与用户列名。
     * @param deptColumn 部门列名（默认拦截器为 dept_id）
     * @param userColumn 用户列名（默认拦截器为 create_by）
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
     */
    public static DataScope onlySelf() {
        DataScope scope = listScope();
        if (SecurityUtils.getUser() != null) {
            scope.setUsername(SecurityUtils.getUser().getUsername());
            scope.setIsOnly(true);
        }
        return scope;
    }

    /**
     * 仅本人数据（自定义用户列名）。
     * @param userColumn 用户列名（默认 create_by）
     */
    public static DataScope onlySelf(String userColumn) {
        DataScope scope = onlySelf();
        scope.setScopeUserName(userColumn);
        return scope;
    }

    /**
     * 显式跳过行级权限过滤。
     * 拦截器将放行原始 SQL，不再追加数据范围条件。
     */
    public static DataScope skip() {
        DataScope scope = listScope();
        scope.setSkip(true);
        return scope;
    }

    /**
     * 在查询 Wrapper 上追加当前登录商家的约束（merchant_id = 当前用户ID）。
     * 适用于商家维度的数据隔离；如实际商家ID与用户ID不一致，请改为 requireMerchant。
     * @param wrapper 查询条件构造器
     * @param <T> Wrapper 泛型
     * @return 原 wrapper（便于链式调用）
     */
    public static <T extends AbstractWrapper<?, String, T>> T requireCurrentMerchant(T wrapper) {
        Long merchantId = SecurityUtils.getUser() != null ? SecurityUtils.getUser().getId() : null;
        if (merchantId != null) {
            wrapper.eq("merchant_id", merchantId);
        }
        return wrapper;
    }

    /**
     * 在查询 Wrapper 上追加指定商家的约束（merchant_id = 传入的商家ID）。
     * @param wrapper 查询条件构造器
     * @param merchantId 商家ID
     * @param <T> Wrapper 泛型
     * @return 原 wrapper（便于链式调用）
     */
    public static <T extends AbstractWrapper<?, String, T>> T requireMerchant(T wrapper, Long merchantId) {
        if (merchantId != null) {
            wrapper.eq("merchant_id", merchantId);
        }
        return wrapper;
    }

    /**
     * 在 LambdaQueryWrapper 上追加当前登录商家的约束（列使用方法引用）。
     * @param wrapper 查询条件构造器
     * @param column 商家ID列方法引用（例如 Entity::getMerchantId）
     * @param <T> 实体类型
     * @return 原 wrapper
     */
    public static <T> LambdaQueryWrapper<T> requireCurrentMerchant(LambdaQueryWrapper<T> wrapper, SFunction<T, ?> column) {
        Long merchantId = SecurityUtils.getUser() != null ? SecurityUtils.getUser().getId() : null;
        if (merchantId != null) {
            wrapper.eq(column, merchantId);
        }
        return wrapper;
    }

    /**
     * 在 LambdaQueryWrapper 上追加指定商家的约束（列使用方法引用）。
     * @param wrapper 查询条件构造器
     * @param column 商家ID列方法引用（例如 Entity::getMerchantId）
     * @param merchantId 商家ID
     * @param <T> 实体类型
     * @return 原 wrapper
     */
    public static <T> LambdaQueryWrapper<T> requireMerchant(LambdaQueryWrapper<T> wrapper, SFunction<T, ?> column, Long merchantId) {
        if (merchantId != null) {
            wrapper.eq(column, merchantId);
        }
        return wrapper;
    }

    /**
     * 在 LambdaUpdateWrapper 上追加当前登录商家的约束（列使用方法引用）。
     */
    public static <T> LambdaUpdateWrapper<T> requireCurrentMerchant(LambdaUpdateWrapper<T> wrapper, SFunction<T, ?> column) {
        Long merchantId = SecurityUtils.getUser() != null ? SecurityUtils.getUser().getId() : null;
        if (merchantId != null) {
            wrapper.eq(column, merchantId);
        }
        return wrapper;
    }

    /**
     * 在 LambdaUpdateWrapper 上追加指定商家的约束（列使用方法引用）。
     */
    public static <T> LambdaUpdateWrapper<T> requireMerchant(LambdaUpdateWrapper<T> wrapper, SFunction<T, ?> column, Long merchantId) {
        if (merchantId != null) {
            wrapper.eq(column, merchantId);
        }
        return wrapper;
    }
}
