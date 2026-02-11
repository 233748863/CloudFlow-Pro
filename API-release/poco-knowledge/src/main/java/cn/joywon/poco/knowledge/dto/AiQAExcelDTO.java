package cn.joywon.poco.knowledge.dto;

import com.alibaba.excel.annotation.ExcelProperty;
import lombok.Data;
import lombok.experimental.FieldNameConstants;

/**
 * qa 对象
 *
 * @author poco
 * @date 2024/7/2
 */
@Data
@FieldNameConstants
public class AiQAExcelDTO {

	@ExcelProperty("问题")
	private String question;

	@ExcelProperty("答案")
	private String answer;

}
