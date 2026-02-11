package cn.joywon.poco.knowledge.dto;

import lombok.Data;

import java.util.List;

/**
 * @author poco
 * @date 2024/10/1 { "base64": "iVBORw0KGgoAAAAN……", "options": { "ocr.language":
 * "models/config_chinese.txt", "ocr.cls": true, "ocr.limit_side_len": 4320,
 * "tbpu.parser": "multi_none", "data.format": "text" } }
 */
@Data
public class UmiOcrImageModelDTO {

	@Data
	public static class UmiOcrImageModelRequest {

		private String images;

		private String base64;

		private UmiOcrImageModelOptions options = new UmiOcrImageModelOptions();

		@Data
		public static class UmiOcrImageModelOptions {

			private String ocrLanguage = "models/config_chinese.txt";

			private boolean ocrCls = true;

			private int ocrLimitSideLen = 4320;

			private String tbpuParser = "multi_none";

			private String dataFormat = "text";

		}

	}

	@Data
	public static class UmiOcrImageModelResponse {

		private int code;

		private List<TextData> data;

		@Data
		public static class TextData {

			private String text;

			private String end;

		}

	}

}
