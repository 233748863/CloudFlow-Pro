package cn.joywon.poco.knowledge.service;

import cn.joywon.poco.knowledge.dto.AiMarkitdownDTO;
import cn.joywon.poco.knowledge.dto.MarkitdownResponseDTO;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.service.annotation.PostExchange;

/**
 * AI Markitdown 助手服务
 *
 * @author poco
 * @date 2024/12/22
 */
public interface AiMarkitdownAssistantService {

    /**
     * 上传 调用 AI Markitdown 服务解析文本
     *
     * @param file            文件
     * @param aiMarkitdownDTO 请求参数
     * @return {@link MarkitdownResponseDTO }
     * <p>
     * 422
     */
    @PostExchange(value = "/upload", contentType = "multipart/form-data")
    MarkitdownResponseDTO upload(@RequestPart("file") MultipartFile file, @RequestPart("request") AiMarkitdownDTO aiMarkitdownDTO);

}
