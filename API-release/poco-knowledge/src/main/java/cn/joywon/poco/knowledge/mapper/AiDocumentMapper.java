package cn.joywon.poco.knowledge.mapper;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import cn.joywon.poco.common.data.datascope.PocoBaseMapper;
import cn.joywon.poco.knowledge.entity.AiDocumentEntity;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface AiDocumentMapper extends PocoBaseMapper<AiDocumentEntity> {

	/**
	 * 获取文档页面
	 * @param page 页
	 * @param aiDocument AI 文档
	 * @return {@link Page }<{@link AiDocumentEntity }>
	 */
	Page<AiDocumentEntity> getDocumentPage(Page<AiDocumentEntity> page, @Param("query") AiDocumentEntity aiDocument);

}
