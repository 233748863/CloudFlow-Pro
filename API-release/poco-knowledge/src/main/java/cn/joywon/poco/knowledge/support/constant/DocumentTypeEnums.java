package cn.joywon.poco.knowledge.support.constant;

import lombok.Getter;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldNameConstants;

/**
 * 文档类型
 *
 * @author poco
 * @date 2024/7/4
 * <p>
 * "0" 答案 "1" 问题
 */
@Getter
@RequiredArgsConstructor
@FieldNameConstants
public enum DocumentTypeEnums {

	ANSWER("0", "答案"), QUESTION("1", "问题");

	private final String type;

	private final String desc;

}
