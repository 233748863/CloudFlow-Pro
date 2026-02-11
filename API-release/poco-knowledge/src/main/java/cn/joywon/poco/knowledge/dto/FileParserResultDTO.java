package cn.joywon.poco.knowledge.dto;

import lombok.Data;

/**
 * 文件解析结果
 *
 * @author poco
 * @date 2024/10/2
 */
@Data
public class FileParserResultDTO {

	/**
	 * 结果
	 */
	private boolean result;

	private String message;

}
