package cn.joywon.poco.user.api.enums;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

/**
 * 页面类型枚举
 *
 * @author poco
 * @date 2024/12/22
 */
@Getter
@RequiredArgsConstructor
public enum PageTypeEnums {
    /**
     * 首页
     */
    HOME(1, "首页装修"),
    /**
     * 个人中心
     */
    USER(2, "个人中心"),
    /**
     * 客服设置
     */
    SERVICE(3, "客服设置");

    private final Integer pageType;

    private final String name;

    /**
     * 按类型获取名称
     *
     * @param pageType 页面类型
     * @return {@link String }
     */
    public static String getNameByType(Integer pageType) {
        for (PageTypeEnums value : PageTypeEnums.values()) {
            if (value.pageType.equals(pageType)) {
                return value.name;
            }
        }
        return null;
    }

}
