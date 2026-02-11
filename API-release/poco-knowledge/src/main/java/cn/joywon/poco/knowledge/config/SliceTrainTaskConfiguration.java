package cn.joywon.poco.knowledge.config;

import cn.joywon.poco.knowledge.service.AiTaskService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

import java.util.concurrent.TimeUnit;

/**
 * @author poco
 * @date 2024/3/15
 * <p>
 * 切片训练
 */
@Slf4j
@EnableScheduling
@RequiredArgsConstructor
@Configuration(proxyBeanMethods = false)
public class SliceTrainTaskConfiguration {

	private final AiTaskService taskService;

	/**
	 * 每分钟扫描文档
	 */
	@Scheduled(fixedRate = 60, timeUnit = TimeUnit.SECONDS)
	public void scanDocument() {
		taskService.updateDocumentSummary();
	}

	/**
	 * 每分钟扫描切片
	 */
	@Scheduled(fixedRate = 60, timeUnit = TimeUnit.SECONDS)
	public void scanSlice() {
		taskService.updateDocumentSlice();
	}

	/**
	 * 扫描 OCRresult
	 */
	@Scheduled(fixedRate = 60, timeUnit = TimeUnit.SECONDS)
	public void scanOCRResult() {
		taskService.updateDocumentOcrResult();
	}

}
