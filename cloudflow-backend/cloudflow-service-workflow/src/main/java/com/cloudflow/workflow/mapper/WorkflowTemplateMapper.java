package com.cloudflow.workflow.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.workflow.domain.WorkflowTemplate;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * 流程模板 Mapper 接口
 * 提供模板数据访问功能
 *
 * @author CloudFlow
 */
@Mapper
public interface WorkflowTemplateMapper extends BaseMapper<WorkflowTemplate> {

    /**
     * 统计使用指定模板的流程数量
     * @param templateId 模板ID
     * @return 使用该模板的流程数量
     */
    int countWorkflowsByTemplateId(@Param("templateId") String templateId);

    /**
     * 增加模板使用次数
     * @param templateId 模板ID
     * @return 影响的行数
     */
    int incrementUsageCount(@Param("templateId") String templateId);
}
