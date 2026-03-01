package com.cloudflow.workflow.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.workflow.domain.TemplateCategory;
import org.apache.ibatis.annotations.Mapper;

/**
 * 模板分类 Mapper 接口
 * 提供模板分类数据访问功能
 *
 * @author CloudFlow
 */
@Mapper
public interface TemplateCategoryMapper extends BaseMapper<TemplateCategory> {
}
