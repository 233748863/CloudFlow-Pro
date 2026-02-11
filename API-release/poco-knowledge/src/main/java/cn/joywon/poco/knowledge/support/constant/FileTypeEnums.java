package cn.joywon.poco.knowledge.support.constant;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

/**
 * 文件类型
 *
 * @author poco
 * @date 2024/10/2
 */
@Getter
@RequiredArgsConstructor
public enum FileTypeEnums {

	TXT("txt"), MD("md"), PDF("pdf"), DOC("doc"), DOCX("docx"), PPT("ppt"), PPTX("pptx"), XLS("xls"), XLSX("xlsx"),
	JPG("jpg"), JPEG("jpeg"), PNG("png");

	private final String type;

}
