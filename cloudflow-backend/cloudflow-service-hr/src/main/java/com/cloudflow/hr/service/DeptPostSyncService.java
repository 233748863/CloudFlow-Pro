package com.cloudflow.hr.service;

import com.cloudflow.hr.client.vo.DeptVO;
import com.cloudflow.hr.client.vo.PostVO;

import java.util.List;

/**
 * 部门岗位数据同步服务接口
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
public interface DeptPostSyncService {

    /**
     * 同步所有部门数据到Redis缓存
     */
    void syncDepartments();

    /**
     * 同步单个部门数据到Redis缓存
     * 
     * @param deptId 部门ID
     */
    void syncDepartment(Long deptId);

    /**
     * 同步所有岗位数据到Redis缓存
     */
    void syncPosts();

    /**
     * 同步单个岗位数据到Redis缓存
     * 
     * @param postId 岗位ID
     */
    void syncPost(Long postId);

    /**
     * 验证部门ID是否有效
     * 
     * @param deptId 部门ID
     * @return true-有效 false-无效
     */
    boolean validateDeptId(Long deptId);

    /**
     * 验证岗位ID是否有效
     * 
     * @param postId 岗位ID
     * @return true-有效 false-无效
     */
    boolean validatePostId(Long postId);

    /**
     * 从缓存获取部门信息
     * 
     * @param deptId 部门ID
     * @return 部门信息
     */
    DeptVO getCachedDept(Long deptId);

    /**
     * 从缓存获取岗位信息
     * 
     * @param postId 岗位ID
     * @return 岗位信息
     */
    PostVO getCachedPost(Long postId);

    /**
     * 从缓存获取部门树
     * 
     * @return 部门树列表
     */
    List<DeptVO> getCachedDeptTree();

    /**
     * 清除部门缓存
     * 
     * @param deptId 部门ID
     */
    void clearDeptCache(Long deptId);

    /**
     * 清除岗位缓存
     * 
     * @param postId 岗位ID
     */
    void clearPostCache(Long postId);

    /**
     * 清除所有部门岗位缓存
     */
    void clearAllCache();
}
