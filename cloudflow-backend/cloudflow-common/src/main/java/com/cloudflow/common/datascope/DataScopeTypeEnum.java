package com.cloudflow.common.datascope;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 数据权限类型枚举
 * 
 * @author CloudFlow
 * @date 2026-02-12
 */
@Getter
@AllArgsConstructor
public enum DataScopeTypeEnum {

    /**
     * 查询全部数据 - 不进行任何数据权限过滤
     */
    ALL(0, "全部"),

    /**
     * 自定义 - 根据角色配置的部门ID列表进行过滤
     */
    CUSTOM(1, "自定义"),

    /**
     * 本级及子级 - 查看本部门及所有下级部门的数据(递归查询)
     */
    OWN_CHILD_LEVEL(2, "本级及子级"),

    /**
     * 本级 - 仅查看本部门的数据
     */
    OWN_LEVEL(3, "本级"),

    /**
     * 本人 - 仅查看个人创建的数据
     */
    SELF_LEVEL(4, "本人");

    /**
     * 类型值
     */
    private final int type;

    /**
     * 描述
     */
    private final String description;

    /**
     * 根据类型值获取枚举
     *
     * @param dsType 数据权限类型值
     * @return 对应的枚举,如果不存在则返回null
     */
    public static DataScopeTypeEnum getByType(Integer dsType) {
        if (dsType == null) {
            return null;
        }
        for (DataScopeTypeEnum value : DataScopeTypeEnum.values()) {
            if (value.getType() == dsType) {
                return value;
            }
        }
        return null;
    }
}
