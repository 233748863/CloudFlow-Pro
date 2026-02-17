package com.cloudflow.common.datascope;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.toolkit.support.SFunction;
import com.cloudflow.common.core.context.UserContext;
import lombok.extern.slf4j.Slf4j;

import java.util.List;

/**
 * 数据权限辅助工具类
 * 直接在 LambdaQueryWrapper 上追加数据权限过滤条件
 * 
 * 使用示例：
 * <pre>
 * LambdaQueryWrapper<LeaveRequest> wrapper = new LambdaQueryWrapper<>();
 * // ... 其他业务条件 ...
 * DataScopeHelper.apply(wrapper, LeaveRequest::getUserId, LeaveRequest::getDeptId);
 * </pre>
 * 
 * 权限类型说明：
 * - 0 = 全部数据（不过滤）
 * - 1 = 自定义部门（按 dsDeptIds 过滤）
 * - 2 = 本级及下级部门（按 dsDeptIds 过滤）
 * - 3 = 本级部门（按 dsDeptIds 过滤）
 * - 4 = 仅本人（按 userId 过滤）
 * 
 * @author CloudFlow
 */
@Slf4j
public class DataScopeHelper {

    private DataScopeHelper() {
        // 工具类禁止实例化
    }

    /**
     * 在 LambdaQueryWrapper 上追加数据权限过滤条件
     * 同时支持按用户ID和部门ID过滤
     *
     * @param wrapper    查询条件构造器
     * @param userIdFunc 实体类中 userId 字段的 Lambda 引用（如 LeaveRequest::getUserId）
     * @param deptIdFunc 实体类中 deptId 字段的 Lambda 引用（如 LeaveRequest::getDeptId）
     * @param <T>        实体类型
     */
    public static <T> void apply(LambdaQueryWrapper<T> wrapper,
                                 SFunction<T, Long> userIdFunc,
                                 SFunction<T, Long> deptIdFunc) {
        Integer dsType = UserContext.getDsType();

        // 未设置权限类型（未登录或白名单接口），不过滤
        if (dsType == null) {
            log.debug("数据权限：dsType 为空，跳过过滤");
            return;
        }

        switch (dsType) {
            case 0:
                // 全部数据权限，不追加任何条件
                log.debug("数据权限：全部数据权限，不过滤");
                break;

            case 1: // 自定义部门
            case 2: // 本级及下级
            case 3: // 本级部门
                // 按部门ID列表过滤
                List<Long> dsDeptIds = UserContext.getDsDeptIds();
                if (dsDeptIds != null && !dsDeptIds.isEmpty()) {
                    wrapper.in(deptIdFunc, dsDeptIds);
                    log.debug("数据权限：按部门过滤，dsType={}, 部门数量={}", dsType, dsDeptIds.size());
                } else {
                    // 有部门权限类型但无部门列表，降级为仅本人
                    Long currentUserId = UserContext.getUserId();
                    if (currentUserId != null) {
                        wrapper.eq(userIdFunc, currentUserId);
                        log.warn("数据权限：部门列表为空，降级为仅本人，userId={}", currentUserId);
                    } else {
                        // 极端情况：无用户信息，返回空结果
                        wrapper.eq(userIdFunc, -1L);
                        log.error("数据权限：无用户信息，返回空结果");
                    }
                }
                break;

            case 4:
                // 仅本人数据
                Long currentUserId = UserContext.getUserId();
                if (currentUserId != null) {
                    wrapper.eq(userIdFunc, currentUserId);
                    log.debug("数据权限：仅本人，userId={}", currentUserId);
                } else {
                    wrapper.eq(userIdFunc, -1L);
                    log.error("数据权限：仅本人模式但 userId 为空，返回空结果");
                }
                break;

            default:
                // 未知权限类型，安全起见仅返回本人数据
                Long fallbackUserId = UserContext.getUserId();
                if (fallbackUserId != null) {
                    wrapper.eq(userIdFunc, fallbackUserId);
                    log.warn("数据权限：未知 dsType={}，降级为仅本人", dsType);
                } else {
                    wrapper.eq(userIdFunc, -1L);
                }
                break;
        }
    }

    /**
     * 仅按用户ID过滤的简化版本
     * 适用于没有 deptId 字段的表（如考勤记录）
     *
     * @param wrapper    查询条件构造器
     * @param userIdFunc 实体类中 userId 字段的 Lambda 引用
     * @param <T>        实体类型
     */
    public static <T> void applyByUser(LambdaQueryWrapper<T> wrapper,
                                       SFunction<T, Long> userIdFunc) {
        Integer dsType = UserContext.getDsType();

        if (dsType == null) {
            return;
        }

        // 全部数据权限不过滤
        if (dsType == 0) {
            return;
        }

        // 其他权限类型统一按用户ID过滤
        Long currentUserId = UserContext.getUserId();
        if (currentUserId != null) {
            wrapper.eq(userIdFunc, currentUserId);
        } else {
            wrapper.eq(userIdFunc, -1L);
        }
    }
}
