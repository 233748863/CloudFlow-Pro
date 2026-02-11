package cn.joywon.poco.knowledge.service;

import cn.joywon.poco.knowledge.dto.UmiOcrImageModelDTO;
import cn.joywon.poco.knowledge.dto.UmiOcrPDFModelDTO;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.service.annotation.PostExchange;

/**
 * @author poco
 * @date 2024/10/1
 */
public interface AiOCRAssistantService {

	@PostExchange("/api/ocr")
	String image(@RequestBody UmiOcrImageModelDTO.UmiOcrImageModelRequest request);

	@PostExchange("/api/doc/upload")
	UmiOcrPDFModelDTO.UmiOcrPDFModelResponse uploadDoc(@RequestPart MultipartFile file);

	@PostExchange("/api/doc/result")
	UmiOcrPDFModelDTO.UmiOcrPDFModelResultResponse docResult(
			@RequestBody UmiOcrPDFModelDTO.UmiOcrPDFModelResultRequest request);

	@PostExchange("/api/doc/download")
	UmiOcrPDFModelDTO.UmiOcrPDFModelDownResponse downloadDoc(
			@RequestBody UmiOcrPDFModelDTO.UmiOcrPDFModelDownRequest request);

}
