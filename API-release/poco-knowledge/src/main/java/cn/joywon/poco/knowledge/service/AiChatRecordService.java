package cn.joywon.poco.knowledge.service;

import com.baomidou.mybatisplus.extension.service.IService;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.knowledge.entity.AiChatRecordEntity;

import java.util.Map;

public interface AiChatRecordService extends IService<AiChatRecordEntity> {

	/**
	 * 保存记录
	 * @param map 上下文参数
	 * @param text 文本
	 * @param llmFlag LLM 标志
	 */
	void saveRecord(Map<Object, Object> map, String text, boolean llmFlag);

	/**
	 * 更新&标注数据
	 * @param aiChatRecord 聊天记录
	 * @return R
	 */
	R updateAndStandardRecord(AiChatRecordEntity aiChatRecord);

	/**
	 * 删除记录和标注
	 * @param ids ids
	 * @return
	 */
	R removeRecordAndStandardByIds(Long[] ids);

}
