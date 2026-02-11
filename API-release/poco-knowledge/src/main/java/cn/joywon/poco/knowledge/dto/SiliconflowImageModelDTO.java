package cn.joywon.poco.knowledge.dto;

import lombok.Data;

import java.util.List;

/**
 * @author poco
 * @date 2024/9/30 "model": "<string>", "prompt": "<string>", "image_size": "1024x1024",
 * "seed": 4999999999
 */
@Data
public class SiliconflowImageModelDTO {

	@Data
	public static class ImageModelRequst {

		private String model;

		private String prompt;

		private String imageSize;

		private Long seed;

	}

	@Data
	public static class ImageModelResponse {

		private List<Image> images;

		private Long seed;

	}

	@Data
	public static class Image {

		private String url;

	}

}
