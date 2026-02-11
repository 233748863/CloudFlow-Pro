package cn.joywon.poco.knowledge.service;

import com.baomidou.mybatisplus.extension.service.IService;
import cn.joywon.poco.knowledge.entity.AiBillEntity;
import dev.langchain4j.model.output.TokenUsage;

import java.util.List;
import java.util.Map;

/**
 * This is the AiBillService interface which extends IService interface with AiBillEntity
 * as its type parameter. It provides a method to save a bill.
 */
public interface AiBillService extends IService<AiBillEntity> {

	/**
	 * 保存账单
	 * @param messageKey 消息键
	 * @param tokenUsage 令牌使用情况
	 */
	void saveBill(Map<Object, Object> messageKey, TokenUsage tokenUsage);

	/**
	 * This method is used to get the sum of the bill.
	 * @return List<Map < String, Object>> This returns a list of map which contains the
	 * sum of the bill.
	 */
	List<Map<String, Object>> getBillSum();

}
