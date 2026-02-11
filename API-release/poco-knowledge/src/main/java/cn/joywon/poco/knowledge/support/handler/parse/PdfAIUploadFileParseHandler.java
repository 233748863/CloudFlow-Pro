package cn.joywon.poco.knowledge.support.handler.parse;

import cn.hutool.core.exceptions.ExceptionUtil;
import cn.hutool.core.io.FileUtil;
import cn.hutool.core.io.IoUtil;
import cn.hutool.core.lang.Pair;
import cn.hutool.core.util.StrUtil;
import cn.joywon.poco.common.core.constant.enums.YesNoEnum;
import cn.joywon.poco.knowledge.config.properties.AiKnowledgeProperties;
import cn.joywon.poco.knowledge.entity.AiDatasetEntity;
import cn.joywon.poco.knowledge.entity.AiDocumentEntity;
import cn.joywon.poco.knowledge.service.AiAssistantService;
import cn.joywon.poco.knowledge.support.constant.FileParserStatusEnums;
import cn.joywon.poco.knowledge.support.constant.FileTypeEnums;
import cn.joywon.poco.knowledge.support.provider.ModelProvider;
import cn.joywon.poco.knowledge.support.util.PromptBuilder;
import dev.langchain4j.data.document.Document;
import dev.langchain4j.data.document.parser.apache.pdfbox.ApachePdfBoxDocumentParser;
import dev.langchain4j.data.message.ImageContent;
import dev.langchain4j.data.message.TextContent;
import dev.langchain4j.data.message.UserMessage;
import dev.langchain4j.model.chat.ChatLanguageModel;
import dev.langchain4j.model.chat.response.ChatResponse;
import lombok.Cleanup;
import lombok.RequiredArgsConstructor;
import lombok.SneakyThrows;
import lombok.extern.slf4j.Slf4j;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.jetbrains.annotations.NotNull;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * @author poco
 * @date 2024/3/15
 * <p>
 * 图片 AI 处理
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PdfAIUploadFileParseHandler implements UploadFileParseHandler {

    private final AiKnowledgeProperties aiKnowledgeProperties;

    private final ModelProvider modelProvider;

    /**
     * 支持
     *
     * @param aiDataset
     * @param documentEntity Document 实体
     * @return boolean
     */
    @Override
    public boolean supports(AiDatasetEntity aiDataset, AiDocumentEntity documentEntity) {

        if (YesNoEnum.NO.getCode().equals(aiDataset.getAiOcrFlag())) {
            return false;
        }

        String contentType = FileUtil.extName(documentEntity.getFileUrl());
        return FileTypeEnums.PDF.getType().equals(contentType);
    }

    /**
     * 解析文件
     *
     * @param documentEntity
     * @param inputStream    文件字节数组
     * @param extName
     * @return String
     */
    @SneakyThrows
    @Override
    public Pair<FileParserStatusEnums, String> file2String(AiDocumentEntity documentEntity, InputStream inputStream,
                                                           String extName) {
        ApachePdfBoxDocumentParser pdfBoxDocumentParser = new ApachePdfBoxDocumentParser();
        @Cleanup ByteArrayOutputStream baos = new ByteArrayOutputStream();
        IoUtil.copy(inputStream, baos);

        try {
            Document document = pdfBoxDocumentParser.parse(new ByteArrayInputStream(baos.toByteArray()));
            return Pair.of(FileParserStatusEnums.PARSE_SUCCESS, document.text());
        } catch (Exception e) {
            log.info("文件 {} pdfbox 解析失败，正在调用 ai ocr", documentEntity.getName());
        }

        // 调用 OCR 服务处理影印版ben
        try (inputStream) {
            return getFileAIParser(documentEntity, new ByteArrayInputStream(baos.toByteArray()));
        }
    }

    @NotNull
    public Pair<FileParserStatusEnums, String> getFileAIParser(AiDocumentEntity documentEntity, InputStream inputStream) throws IOException {

        PDDocument document = PDDocument.load(inputStream);
        PDFRenderer pdfRenderer = new PDFRenderer(document);

        // 循环处理每一页，将其转换为图片
        List<String> stringList = new ArrayList<>();
        for (int page = 0; page < document.getNumberOfPages(); page++) {
            // 渲染为 BufferedImage，DPI 可以根据需求调整，越高质量越好
            BufferedImage image = pdfRenderer.renderImageWithDPI(page, aiKnowledgeProperties.getVision().getDpi()); // 100 DPI

            // 将图片保存为 PNG 文件

            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            ImageIO.write(image, "PNG", baos);

            String encodeToString = Base64.getEncoder().encodeToString(baos.toByteArray());

            try {
                log.info("正在处理文件: {} AI OCR 解析， 处理 {} 页", documentEntity.getName(), page + 1);
                Pair<ChatLanguageModel, AiAssistantService> aiVisionAssistant = modelProvider.getAiVisionAssistant();
                UserMessage userMessage = UserMessage.from(
                        TextContent.from(PromptBuilder.render("ocr-common.st", Map.of())),
                        ImageContent.from(encodeToString, MediaType.IMAGE_PNG_VALUE));

                ChatResponse chatResponse = aiVisionAssistant.getKey().chat(userMessage);
                stringList.add(chatResponse.aiMessage().text());
            } catch (Exception exception) {
                log.error("文件: {} AI OCR 解析失败， 处理 {} 页", documentEntity.getName(), page + 1, exception);
                return Pair.of(FileParserStatusEnums.PARSE_FAIL,
                        StrUtil.format("AI 解析失败， 处理 {} 页 ：{}", page + 1, ExceptionUtil.getMessage(exception)));
            } finally {
                baos.close();
            }
        }

        return Pair.of(FileParserStatusEnums.PARSE_SUCCESS, stringList.stream().collect(Collectors.joining()));
    }

    /**
     * 排序； 数值越大，优先加载
     *
     * @return int
     */
    @Override
    public int getOrder() {
        return 100;
    }

}
