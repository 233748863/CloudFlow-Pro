package cn.joywon.poco.knowledge.service;

import com.baomidou.mybatisplus.extension.service.IService;
import cn.joywon.poco.knowledge.entity.AiDocumentEntity;
import cn.joywon.poco.knowledge.entity.AiSliceEntity;
import cn.joywon.poco.knowledge.support.constant.SliceStatusEnums;

import java.util.List;

public interface AiSliceService extends IService<AiSliceEntity> {

	/**
	 * 通过id删除切片和嵌入向量
	 * @param sliceIdList id 列表
	 */
	Boolean removeSliceAndEbeddingById(List<Long> sliceIdList);

	/**
	 * 异步更新切片的命中次数 & 文档的命中次数
	 * @param collect
	 */
	void updateHitCount(List<String> collect);

	/**
	 * 嵌入切片
	 * @param documentEntity Document 实体
	 * @param sliceStatusEnums 切片状态枚举
	 */
	void embedSlice(AiDocumentEntity documentEntity, SliceStatusEnums sliceStatusEnums);

	/**
	 * 更新切片
	 * @param aiSlice AI 切片
	 * @return {@link Boolean }
	 */
	Boolean updateSlice(AiSliceEntity aiSlice);

}
