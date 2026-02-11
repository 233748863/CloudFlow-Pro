package cn.joywon.poco.knowledge.support.constant;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

/**
 * @author poco
 * @date 2024/3/28
 * <p>
 * 上传方式枚举
 */
@Getter
@RequiredArgsConstructor
public enum SourceTypeEnums {

	UPLOAD("1", "上传文件"), TEXT("2", "文本录入"), QA("3", "Q&A"), ISSUE("4", "工单");

	private final String type;

	private final String description;

}
