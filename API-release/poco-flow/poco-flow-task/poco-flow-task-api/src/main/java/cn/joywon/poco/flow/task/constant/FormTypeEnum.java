package cn.joywon.poco.flow.task.constant;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

import java.util.ArrayList;

/**
 * 表单类型枚举
 */
@Getter
@RequiredArgsConstructor
public enum FormTypeEnum {

	INPUT("Input", "单行文本", ""), TEXTAREA("Textarea", "多行文本", ""), NUMBER("Number", "数字", null),
	DATE("Date", "日期", null), DATE_TIME("DateTime", "日期时间", null),

	SEQUENCE("Sequence", "发号器", null), LAYOUT("Layout", "明细", null), TIME("Time", "时间", null),
	MONEY("Money", "金额", null), SINGLE_SELECT("SingleSelect", "单选", new ArrayList<>()),
	SELECT_DEPT("SelectDept", "部门", new ArrayList<>()), SELECT_USER("SelectUser", "用户", new ArrayList<>()),

	;

	private final String type;

	private final String name;

	private final Object defaultValue;

}
