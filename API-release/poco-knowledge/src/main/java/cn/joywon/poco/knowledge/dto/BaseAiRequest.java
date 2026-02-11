package cn.joywon.poco.knowledge.dto;

import cn.joywon.poco.knowledge.support.annotation.FieldPrompt;
import lombok.Data;
import lombok.experimental.FieldNameConstants;

/**
 * 基础请求类
 *
 * @author poco
 * @date 2024/4/24
 */
@Data
@FieldNameConstants
public class BaseAiRequest {

	/**
	 * 请求TOKEN
	 */
	@FieldPrompt("The messageKey field entered by the user is returned to the function in its entirety")
	private String messageKey;

}
