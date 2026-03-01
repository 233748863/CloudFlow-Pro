package com.cloudflow.workflow.service;

import com.cloudflow.workflow.domain.dto.VersionComparisonDTO;

/**
 * 版本对比服务接口
 * 提供流程版本之间的差异对比功能
 * 
 * @author CloudFlow
 */
public interface IVersionComparisonService {

    /**
     * 对比两个版本的差异
     * 识别节点和连接的新增、删除、修改
     * 
     * @param fromVersionId 源版本ID
     * @param toVersionId 目标版本ID
     * @return 版本对比结果
     */
    VersionComparisonDTO compareVersions(String fromVersionId, String toVersionId);

    /**
     * 对比两个流程定义的差异
     * 直接对比 JSON 定义
     * 
     * @param fromDefinition 源定义（JSON字符串）
     * @param toDefinition 目标定义（JSON字符串）
     * @return 版本对比结果
     */
    VersionComparisonDTO compareDefinitions(String fromDefinition, String toDefinition);
}
