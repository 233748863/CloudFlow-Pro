package com.cloudflow.workflow.service;

import com.cloudflow.workflow.domain.WfProcessDefinition;
import com.cloudflow.workflow.domain.WfFormDefinition;
import com.cloudflow.workflow.domain.vo.UserBriefVO;

/**
 * 工作流缓存服务接口
 * 用于缓存热点数据，减少数据库查询压力
 * 
 * @author CloudFlow Team
 * @since 2026-02-21
 */
public interface IWorkflowCacheService {

    /**
     * 获取流程定义（带缓存）
     * 缓存时间：1小时
     * 
     * @param definitionId 流程定义ID
     * @return 流程定义
     */
    WfProcessDefinition getDefinition(String definitionId);

    /**
     * 获取表单定义（带缓存）
     * 缓存时间：1小时
     * 
     * @param formId 表单ID
     * @return 表单定义
     */
    WfFormDefinition getForm(String formId);

    /**
     * 获取用户信息（带缓存）
     * 缓存时间：30分钟
     * 
     * @param userId 用户ID
     * @return 用户信息
     */
    UserBriefVO getUser(Long userId);

    /**
     * 失效流程定义缓存
     * 在流程定义发布或更新时调用
     * 
     * @param definitionId 流程定义ID
     */
    void evictDefinition(String definitionId);

    /**
     * 失效表单定义缓存
     * 在表单定义更新时调用
     * 
     * @param formId 表单ID
     */
    void evictForm(String formId);

    /**
     * 失效用户信息缓存
     * 在用户信息更新时调用
     * 
     * @param userId 用户ID
     */
    void evictUser(Long userId);

    /**
     * 清空所有缓存
     * 谨慎使用
     */
    void evictAll();

    /**
     * 获取缓存统计信息
     * 
     * @return 缓存统计信息（命中率、大小等）
     */
    CacheStats getCacheStats();

    /**
     * 缓存统计信息
     */
    class CacheStats {
        private long definitionCacheSize;
        private long formCacheSize;
        private long userCacheSize;
        private double definitionHitRate;
        private double formHitRate;
        private double userHitRate;

        // Getters and Setters
        public long getDefinitionCacheSize() {
            return definitionCacheSize;
        }

        public void setDefinitionCacheSize(long definitionCacheSize) {
            this.definitionCacheSize = definitionCacheSize;
        }

        public long getFormCacheSize() {
            return formCacheSize;
        }

        public void setFormCacheSize(long formCacheSize) {
            this.formCacheSize = formCacheSize;
        }

        public long getUserCacheSize() {
            return userCacheSize;
        }

        public void setUserCacheSize(long userCacheSize) {
            this.userCacheSize = userCacheSize;
        }

        public double getDefinitionHitRate() {
            return definitionHitRate;
        }

        public void setDefinitionHitRate(double definitionHitRate) {
            this.definitionHitRate = definitionHitRate;
        }

        public double getFormHitRate() {
            return formHitRate;
        }

        public void setFormHitRate(double formHitRate) {
            this.formHitRate = formHitRate;
        }

        public double getUserHitRate() {
            return userHitRate;
        }

        public void setUserHitRate(double userHitRate) {
            this.userHitRate = userHitRate;
        }
    }
}
