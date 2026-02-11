package cn.joywon.poco.knowledge.dto;

import lombok.Data;

/**
 * 重排模型
 *
 * @author poco
 * @date 2024/10/1
 */
@Data
public class RerankerModelDTO {

	@Data
	public static class RerankerModelRequest {

		private String model;

		private String query;

		private String[] documents;

		private Integer topN;

		private Boolean returnDocuments;

		private Integer maxChunksPerDoc;

		private Integer overlapTokens;

	}

	@Data
	public static class RerankerModelResponse {

		private String id;

		private Results[] results;

		private Tokens tokens;

		@Data
		public static class Results {

			private Document document;

			private Integer index;

			private Integer relevanceScore;

			@Data
			public static class Document {

				private String text;

			}

		}

		@Data
		public static class Tokens {

			private Integer inputTokens;

			private Integer outputTokens;

		}

	}

}
