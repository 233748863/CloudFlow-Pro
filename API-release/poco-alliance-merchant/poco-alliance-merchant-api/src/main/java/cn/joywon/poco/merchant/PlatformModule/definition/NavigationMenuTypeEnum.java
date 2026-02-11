package cn.joywon.poco.merchant.PlatformModule.definition;

import com.baomidou.mybatisplus.annotation.EnumValue;
import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public enum NavigationMenuTypeEnum {

    TOP("TOP", "顶部导航菜单"),
    MID("MID", "中间导航菜单"),
    SIDE("SIDE", "侧边导航菜单");

    public static final String MENU_TYPE_REGEX_PATTERN = "^(TOP|MID|SIDE)$";

    @EnumValue
    private final String value;
    private final String desc;

}