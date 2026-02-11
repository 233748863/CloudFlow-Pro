package cn.joywon.poco.knowledge.dto;

import dev.langchain4j.model.output.structured.Description;
import lombok.Data;

import java.util.List;

/**
 * 大模型解析结果
 *
 * @author poco
 * @date 2024/9/17
 */
@Data
@Description("解析POJO结果对象")
public class LllAiOcrResult {

	@Description("是否包含输入文本要求的字段信息，true: 包含，false: 不包含")
	private boolean isSuccessful;

	@Description("从输入的文本中提取多个【OCR结果字段】")
	private List<OcrField> ocrFieldList;

}

@Data
@Description("OCR结果字段，注意输入文本对值的要求格式")
class OcrField {

	@Description("字段名称")
	String fieldName;

	@Description("值")
	String fieldValue;

}
