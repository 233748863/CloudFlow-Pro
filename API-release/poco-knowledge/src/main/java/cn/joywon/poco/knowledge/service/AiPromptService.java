package cn.joywon.poco.knowledge.service;

import com.baomidou.mybatisplus.extension.service.IService;
import cn.joywon.poco.knowledge.dto.AiPromptDTO;
import cn.joywon.poco.knowledge.entity.AiPromptEntity;

public interface AiPromptService extends IService<AiPromptEntity> {

	/**
	 * 优化提示
	 * @param prompt 提示
	 * @return {@link String }
	 */
	String optimizePrompt(AiPromptDTO prompt);

}
