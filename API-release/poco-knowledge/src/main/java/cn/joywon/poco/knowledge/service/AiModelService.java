package cn.joywon.poco.knowledge.service;

import com.baomidou.mybatisplus.extension.service.IService;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.knowledge.entity.AiModelEntity;

import java.util.ArrayList;

public interface AiModelService extends IService<AiModelEntity> {

	/**
	 * 更新模型
	 * @param aiModel AI 模型
	 * @return boolean
	 */
	R updateModel(AiModelEntity aiModel);

	/**
	 * 删除模型
	 * @param list 列表
	 * @return boolean
	 */
	R removeModel(ArrayList<Long> list);

	/**
	 * 保存模型
	 * @param aiModel AI 模型
	 * @return {@link R }
	 */
	R saveModel(AiModelEntity aiModel);

}
