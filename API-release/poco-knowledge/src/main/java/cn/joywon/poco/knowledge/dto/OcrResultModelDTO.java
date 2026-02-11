package cn.joywon.poco.knowledge.dto;

import lombok.Data;

import java.util.List;

/**
 * @author poco
 * @date 2024/3/13
 */
@Data
public class OcrResultModelDTO {

	/**
	 * The status code of the OCR operation. A successful operation is usually indicated
	 * by a status code of 200.
	 */
	private int statusCode;

	/**
	 * The results of the OCR operation. Each result includes the recognized text, a
	 * score, and the position of the text in the image.
	 */
	private List<OcrResult> results;

	/**
	 * This is a nested static class named OcrResult. It represents the result of an OCR
	 * operation.
	 */
	@Data
	public static class OcrResult {

		/**
		 * The recognized text from the OCR operation.
		 */
		private String text;

		/**
		 * The score of the OCR operation. It represents the confidence level of the
		 * recognized text.
		 */
		private double score;

		/**
		 * The position of the recognized text in the image. It is represented as a list
		 * of lists, where each inner list contains the coordinates of a point.
		 */
		private List<List<Double>> position;

	}

}
