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
public class UmiOcrPDFModelDTO {

	@Data
	public static class UmiOcrPDFModelRequest {

		private String base64;

		private UmiOcrPDFModelOptions options = new UmiOcrPDFModelOptions();

		@Data
		public static class UmiOcrPDFModelOptions {

			private String ocrLanguage = "models/config_chinese.txt";

			private boolean ocrCls = true;

			private int ocrLimitSideLen = 4320;

			private String tbpuParser = "multi_none";

			private String dataFormat = "text";

		}

	}

	@Data
	public static class UmiOcrPDFModelResultRequest {

		private String id;

	}

	@Data
	public static class UmiOcrPDFModelResponse {

		private int code;

		private String data;

	}

	@Data
	public static class UmiOcrPDFModelResultResponse {

		private int code;

		private String state;

	}

	@Data
	public static class UmiOcrPDFModelDownRequest {

		private String id;

		private List<String> file_types;

		private boolean ingore_blank;

	}

	@Data
	public static class UmiOcrPDFModelDownResponse {

		private int code;

		private String data;

		private String name;

	}

}
