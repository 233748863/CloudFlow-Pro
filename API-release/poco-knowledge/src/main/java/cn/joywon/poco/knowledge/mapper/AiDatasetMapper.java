package cn.joywon.poco.knowledge.mapper;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import cn.joywon.poco.common.data.datascope.PocoBaseMapper;
import cn.joywon.poco.knowledge.entity.AiDatasetEntity;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface AiDatasetMapper extends PocoBaseMapper<AiDatasetEntity> {

	/**
	 * “获取 AI 数据集”页面
	 * @param page 页
	 * @return {@link Page }<{@link AiDatasetEntity }>
	 */
	Page<AiDatasetEntity> getAiDatasetPage(Page<AiDatasetEntity> page);

}
