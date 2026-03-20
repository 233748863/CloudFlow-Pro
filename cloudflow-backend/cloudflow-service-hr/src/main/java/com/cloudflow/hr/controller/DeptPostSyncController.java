package com.cloudflow.hr.controller;

import com.cloudflow.hr.client.vo.DeptVO;
import com.cloudflow.hr.client.vo.PostVO;
import com.cloudflow.hr.service.DeptPostSyncService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 部门岗位数据同步控制器
 * 
 * 提供手动同步和缓存管理接口
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Slf4j
@RestController
@RequestMapping("/api/hr/sync")
@RequiredArgsConstructor
public class DeptPostSyncController {

    private final DeptPostSyncService deptPostSyncService;

    /**
     * 手动同步所有部门数据
     * 
     * @return 操作结果
     */
    @PostMapping("/departments")
    public Map<String, Object> syncDepartments() {
        log.info("手动触发部门数据同步");
        
        Map<String, Object> result = new HashMap<>();
        try {
            deptPostSyncService.syncDepartments();
            result.put("success", true);
            result.put("message", "部门数据同步成功");
        } catch (Exception e) {
            log.error("部门数据同步失败", e);
            result.put("success", false);
            result.put("message", "部门数据同步失败：" + e.getMessage());
        }
        
        return result;
    }

    /**
     * 手动同步单个部门数据
     * 
     * @param deptId 部门ID
     * @return 操作结果
     */
    @PostMapping("/department/{deptId}")
    public Map<String, Object> syncDepartment(@PathVariable Long deptId) {
        log.info("手动触发部门数据同步，部门ID：{}", deptId);
        
        Map<String, Object> result = new HashMap<>();
        try {
            deptPostSyncService.syncDepartment(deptId);
            result.put("success", true);
            result.put("message", "部门数据同步成功");
        } catch (Exception e) {
            log.error("部门数据同步失败，部门ID：{}", deptId, e);
            result.put("success", false);
            result.put("message", "部门数据同步失败：" + e.getMessage());
        }
        
        return result;
    }

    /**
     * 手动同步所有岗位数据
     * 
     * @return 操作结果
     */
    @PostMapping("/posts")
    public Map<String, Object> syncPosts() {
        log.info("手动触发岗位数据同步");
        
        Map<String, Object> result = new HashMap<>();
        try {
            deptPostSyncService.syncPosts();
            result.put("success", true);
            result.put("message", "岗位数据同步成功");
        } catch (Exception e) {
            log.error("岗位数据同步失败", e);
            result.put("success", false);
            result.put("message", "岗位数据同步失败：" + e.getMessage());
        }
        
        return result;
    }

    /**
     * 手动同步单个岗位数据
     * 
     * @param postId 岗位ID
     * @return 操作结果
     */
    @PostMapping("/post/{postId}")
    public Map<String, Object> syncPost(@PathVariable Long postId) {
        log.info("手动触发岗位数据同步，岗位ID：{}", postId);
        
        Map<String, Object> result = new HashMap<>();
        try {
            deptPostSyncService.syncPost(postId);
            result.put("success", true);
            result.put("message", "岗位数据同步成功");
        } catch (Exception e) {
            log.error("岗位数据同步失败，岗位ID：{}", postId, e);
            result.put("success", false);
            result.put("message", "岗位数据同步失败：" + e.getMessage());
        }
        
        return result;
    }

    /**
     * 获取缓存的部门信息
     * 
     * @param deptId 部门ID
     * @return 部门信息
     */
    @GetMapping("/department/{deptId}")
    public Map<String, Object> getCachedDept(@PathVariable Long deptId) {
        log.info("获取缓存的部门信息，部门ID：{}", deptId);
        
        Map<String, Object> result = new HashMap<>();
        DeptVO dept = deptPostSyncService.getCachedDept(deptId);
        
        if (dept != null) {
            result.put("success", true);
            result.put("data", dept);
        } else {
            result.put("success", false);
            result.put("message", "部门信息不存在或缓存已过期");
        }
        
        return result;
    }

    /**
     * 获取缓存的岗位信息
     * 
     * @param postId 岗位ID
     * @return 岗位信息
     */
    @GetMapping("/post/{postId}")
    public Map<String, Object> getCachedPost(@PathVariable Long postId) {
        log.info("获取缓存的岗位信息，岗位ID：{}", postId);
        
        Map<String, Object> result = new HashMap<>();
        PostVO post = deptPostSyncService.getCachedPost(postId);
        
        if (post != null) {
            result.put("success", true);
            result.put("data", post);
        } else {
            result.put("success", false);
            result.put("message", "岗位信息不存在或缓存已过期");
        }
        
        return result;
    }

    /**
     * 获取缓存的部门树
     * 
     * @return 部门树
     */
    @GetMapping("/departments/tree")
    public Map<String, Object> getCachedDeptTree() {
        log.info("获取缓存的部门树");
        
        Map<String, Object> result = new HashMap<>();
        List<DeptVO> deptTree = deptPostSyncService.getCachedDeptTree();
        
        result.put("success", true);
        result.put("data", deptTree);
        result.put("count", deptTree.size());
        
        return result;
    }

    /**
     * 清除部门缓存
     * 
     * @param deptId 部门ID
     * @return 操作结果
     */
    @DeleteMapping("/department/{deptId}")
    public Map<String, Object> clearDeptCache(@PathVariable Long deptId) {
        log.info("清除部门缓存，部门ID：{}", deptId);
        
        Map<String, Object> result = new HashMap<>();
        try {
            deptPostSyncService.clearDeptCache(deptId);
            result.put("success", true);
            result.put("message", "部门缓存清除成功");
        } catch (Exception e) {
            log.error("清除部门缓存失败，部门ID：{}", deptId, e);
            result.put("success", false);
            result.put("message", "清除部门缓存失败：" + e.getMessage());
        }
        
        return result;
    }

    /**
     * 清除岗位缓存
     * 
     * @param postId 岗位ID
     * @return 操作结果
     */
    @DeleteMapping("/post/{postId}")
    public Map<String, Object> clearPostCache(@PathVariable Long postId) {
        log.info("清除岗位缓存，岗位ID：{}", postId);
        
        Map<String, Object> result = new HashMap<>();
        try {
            deptPostSyncService.clearPostCache(postId);
            result.put("success", true);
            result.put("message", "岗位缓存清除成功");
        } catch (Exception e) {
            log.error("清除岗位缓存失败，岗位ID：{}", postId, e);
            result.put("success", false);
            result.put("message", "清除岗位缓存失败：" + e.getMessage());
        }
        
        return result;
    }

    /**
     * 清除所有部门岗位缓存
     * 
     * @return 操作结果
     */
    @DeleteMapping("/all")
    public Map<String, Object> clearAllCache() {
        log.info("清除所有部门岗位缓存");
        
        Map<String, Object> result = new HashMap<>();
        try {
            deptPostSyncService.clearAllCache();
            result.put("success", true);
            result.put("message", "所有缓存清除成功");
        } catch (Exception e) {
            log.error("清除所有缓存失败", e);
            result.put("success", false);
            result.put("message", "清除所有缓存失败：" + e.getMessage());
        }
        
        return result;
    }

    /**
     * 验证部门ID是否有效
     * 
     * @param deptId 部门ID
     * @return 验证结果
     */
    @GetMapping("/validate/department/{deptId}")
    public Map<String, Object> validateDeptId(@PathVariable Long deptId) {
        log.info("验证部门ID，部门ID：{}", deptId);
        
        Map<String, Object> result = new HashMap<>();
        boolean isValid = deptPostSyncService.validateDeptId(deptId);
        
        result.put("success", true);
        result.put("valid", isValid);
        result.put("message", isValid ? "部门ID有效" : "部门ID无效");
        
        return result;
    }

    /**
     * 验证岗位ID是否有效
     * 
     * @param postId 岗位ID
     * @return 验证结果
     */
    @GetMapping("/validate/post/{postId}")
    public Map<String, Object> validatePostId(@PathVariable Long postId) {
        log.info("验证岗位ID，岗位ID：{}", postId);
        
        Map<String, Object> result = new HashMap<>();
        boolean isValid = deptPostSyncService.validatePostId(postId);
        
        result.put("success", true);
        result.put("valid", isValid);
        result.put("message", isValid ? "岗位ID有效" : "岗位ID无效");
        
        return result;
    }
}
