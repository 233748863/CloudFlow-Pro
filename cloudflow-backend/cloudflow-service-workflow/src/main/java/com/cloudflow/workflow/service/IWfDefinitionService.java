package com.cloudflow.workflow.service;

import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.workflow.domain.WfProcessDefinition;

import java.util.Map;

/**
 * 流程定义管理服务接口
 * 负责流程定义的保存、发布、删除、查询等操作
 * 
 * 从原工作流服务拆分而来，参考 RuoYi-Cloud-Plus IFlwDefinitionService 设计
 *
 * @author CloudFlow
 */
public interface IWfDefinitionService {

    /**
     * 保存流程定义
     *
     * @param definition 流程定义对象
     * @return 结果（包含 definitionId）
     */
    R<?> saveProcessDefinition(WfProcessDefinition definition);

    /**
     * 发布流程定义
     *
     * @param definitionId 流程定义ID
     * @return 结果
     */
    R<?> deployProcessDefinition(String definitionId);

    /**
     * 删除流程定义（有历史实例则归档，无则物理删除）
     *
     * @param definitionId 流程定义ID
     * @return 结果
     */
    R<?> deleteProcessDefinition(String definitionId);

    /**
     * 查询流程定义详情
     *
     * @param definitionId 流程定义ID
     * @return 流程定义
     */
    WfProcessDefinition getProcessDefinition(String definitionId);

    /**
     * 查询流程定义列表（分页）
     *
     * @param pageQuery 分页参数
     * @return 流程定义列表
     */
    PageResult<WfProcessDefinition> listProcessDefinitions(PageQuery pageQuery);

    /**
     * P1-6: 获取流程定义的流程图结构
     * 解析 modelJson 生成节点列表和连线列表，仅包含定义级别信息，不含运行时状态
     *
     * @param definitionId 流程定义ID
     * @return 流程图结构 { nodes: [...], edges: [...] }
     */
    Map<String, Object> getFlowchartStructure(String definitionId);
}
