package com.cloudflow.workflow.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.workflow.domain.WfProcessCategory;
import org.apache.ibatis.annotations.Mapper;

/**
 * 流程分类 Mapper 接口
 *
 * @author CloudFlow
 */
@Mapper
public interface WfProcessCategoryMapper extends BaseMapper<WfProcessCategory> {
}
