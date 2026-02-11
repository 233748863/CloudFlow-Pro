package cn.joywon.poco.knowledge.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.IService;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.knowledge.entity.AiDatasetEntity;

public interface AiDatasetService extends IService<AiDatasetEntity> {

	/**
	 * “获取 AI 数据集”页面
	 * @param page 页
	 * @return {@link Page }<{@link AiDatasetEntity }>
	 */
	Page<AiDatasetEntity> getAiDatasetPage(Page<AiDatasetEntity> page);

	/**
	 * 根据ID查询知识库
	 * @param datasetId 知识库ID
	 * @return R
	 */
	R getDatasetById(Long datasetId);

	/**
	 * 创建知识库
	 * @param aiDataset 知识库
	 * @return boolean
	 */
	R saveDataset(AiDatasetEntity aiDataset);

}
