package com.cloudflow.workflow.service;

import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.workflow.domain.WfFormDefinition;

/**
 * 表单管理服务接口
 * 负责表单定义的保存、查询等操作
 * 
 * 从 WorkflowServiceImpl 拆分而来
 *
 * @author CloudFlow
 */
public interface IWfFormService {

    /**
     * 保存表单定义
     *
     * @param definition 表单定义对象
     * @return 结果（包含 formId）
     */
    R<?> saveFormDefinition(WfFormDefinition definition);

    /**
     * 查询表单定义
     *
     * @param formId 表单ID
     * @return 表单定义
     */
    WfFormDefinition getFormDefinition(String formId);

    /**
     * 查询所有表单定义（分页）
     *
     * @param pageQuery 分页参数
     * @return 表单定义列表
     */
    PageResult<WfFormDefinition> listFormDefinitions(PageQuery pageQuery);
}
