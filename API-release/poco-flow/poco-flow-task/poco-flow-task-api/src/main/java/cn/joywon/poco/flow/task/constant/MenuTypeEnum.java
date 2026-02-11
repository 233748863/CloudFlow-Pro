package cn.joywon.poco.flow.task.constant;

import com.baomidou.mybatisplus.annotation.EnumValue;
import lombok.Getter;
import lombok.RequiredArgsConstructor;

/**
 * 菜单类型枚举
 *
 * @author haoxr
 * @since 2022/4/23 9:36
 */

@Getter
@RequiredArgsConstructor
public enum MenuTypeEnum implements IBaseEnum<Integer> {

	NULL(0, null), MENU(1, "菜单"), CATALOG(2, "目录"), EXTLINK(3, "外链"), BUTTON(4, "按钮");

	@EnumValue // Mybatis-Plus 提供注解表示插入数据库时插入该值
	private final Integer value;

	// @JsonValue // 表示对枚举序列化时返回此字段
	private final String label;

}
