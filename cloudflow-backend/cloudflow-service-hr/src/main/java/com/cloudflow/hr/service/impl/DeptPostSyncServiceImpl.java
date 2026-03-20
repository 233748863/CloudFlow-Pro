package com.cloudflow.hr.service.impl;
import com.cloudflow.common.core.utils.SecurityUtils;

import com.cloudflow.common.core.utils.RedisCache;
import com.cloudflow.hr.client.AuthServiceClient;
import com.cloudflow.hr.client.vo.DeptTreeVO;
import com.cloudflow.hr.client.vo.DeptVO;
import com.cloudflow.hr.client.vo.PostVO;
import com.cloudflow.hr.service.DeptPostSyncService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * 部门岗位数据同步服务实现类
 * 
 * 通过Redis缓存Auth服务的部门和岗位数据，提供快速访问能力
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DeptPostSyncServiceImpl implements DeptPostSyncService {

    private final AuthServiceClient authServiceClient;
    private final RedisCache redisCache;

    /**
     * 部门缓存Key前缀
     */
    private static final String DEPT_CACHE_KEY = "hr:dept:";

    /**
     * 岗位缓存Key前缀
     */
    private static final String POST_CACHE_KEY = "hr:post:";

    /**
     * 部门树缓存Key
     */
    private static final String DEPT_TREE_CACHE_KEY = "hr:dept:tree";

    /**
     * 岗位列表缓存Key
     */
    private static final String POST_LIST_CACHE_KEY = "hr:post:list";

    /**
     * 缓存过期时间（小时）
     */
    private static final long CACHE_EXPIRE_HOURS = 24;

    @Override
    public void syncDepartments() {
        log.info("开始同步所有部门数据到Redis缓存");
        
        try {
            // 调用Auth服务获取部门树
            List<DeptTreeVO> deptTree = authServiceClient.getDeptTree(null).getData();
            
            if (deptTree == null || deptTree.isEmpty()) {
                log.warn("从Auth服务获取的部门树为空");
                return;
            }

            // 缓存部门树
            redisCache.setCacheObject(DEPT_TREE_CACHE_KEY, deptTree, CACHE_EXPIRE_HOURS, TimeUnit.HOURS);
            log.info("部门树缓存成功，共{}个顶级部门", deptTree.size());

            // 递归缓存每个部门
            int count = cacheDeptTreeRecursive(deptTree);
            log.info("同步部门数据完成，共缓存{}个部门", count);
            
        } catch (Exception e) {
            log.error("同步部门数据失败", e);
            throw new RuntimeException("同步部门数据失败：" + e.getMessage(), e);
        }
    }

    @Override
    public void syncDepartment(Long deptId) {
        log.info("同步单个部门数据，部门ID：{}", deptId);
        
        try {
            // 调用Auth服务获取部门信息
            DeptVO dept = authServiceClient.getDeptById(deptId).getData();
            
            if (dept == null) {
                log.warn("从Auth服务获取的部门信息为空，部门ID：{}", deptId);
                // 清除缓存
                clearDeptCache(deptId);
                return;
            }

            // 缓存部门信息
            String cacheKey = DEPT_CACHE_KEY + deptId;
            redisCache.setCacheObject(cacheKey, dept, CACHE_EXPIRE_HOURS, TimeUnit.HOURS);
            log.info("部门缓存成功，部门ID：{}，部门名称：{}", deptId, dept.getDeptName());
            
        } catch (Exception e) {
            log.error("同步部门数据失败，部门ID：{}", deptId, e);
            throw new RuntimeException("同步部门数据失败：" + e.getMessage(), e);
        }
    }

    @Override
    public void syncPosts() {
        log.info("开始同步所有岗位数据到Redis缓存");
        
        try {
            // 调用Auth服务获取岗位列表
            List<PostVO> postList = authServiceClient.getPostList(null).getData();
            
            if (postList == null || postList.isEmpty()) {
                log.warn("从Auth服务获取的岗位列表为空");
                return;
            }

            // 缓存岗位列表
            redisCache.setCacheObject(POST_LIST_CACHE_KEY, postList, CACHE_EXPIRE_HOURS, TimeUnit.HOURS);
            log.info("岗位列表缓存成功，共{}个岗位", postList.size());

            // 缓存每个岗位
            for (PostVO post : postList) {
                String cacheKey = POST_CACHE_KEY + post.getPostId();
                redisCache.setCacheObject(cacheKey, post, CACHE_EXPIRE_HOURS, TimeUnit.HOURS);
            }
            
            log.info("同步岗位数据完成，共缓存{}个岗位", postList.size());
            
        } catch (Exception e) {
            log.error("同步岗位数据失败", e);
            throw new RuntimeException("同步岗位数据失败：" + e.getMessage(), e);
        }
    }

    @Override
    public void syncPost(Long postId) {
        log.info("同步单个岗位数据，岗位ID：{}", postId);
        
        try {
            // 调用Auth服务获取岗位信息
            PostVO post = authServiceClient.getPostById(postId).getData();
            
            if (post == null) {
                log.warn("从Auth服务获取的岗位信息为空，岗位ID：{}", postId);
                // 清除缓存
                clearPostCache(postId);
                return;
            }

            // 缓存岗位信息
            String cacheKey = POST_CACHE_KEY + postId;
            redisCache.setCacheObject(cacheKey, post, CACHE_EXPIRE_HOURS, TimeUnit.HOURS);
            log.info("岗位缓存成功，岗位ID：{}，岗位名称：{}", postId, post.getPostName());
            
        } catch (Exception e) {
            log.error("同步岗位数据失败，岗位ID：{}", postId, e);
            throw new RuntimeException("同步岗位数据失败：" + e.getMessage(), e);
        }
    }

    @Override
    public boolean validateDeptId(Long deptId) {
        if (deptId == null) {
            return false;
        }

        // 先从缓存获取
        DeptVO dept = getCachedDept(deptId);
        if (dept != null) {
            return true;
        }

        // 缓存未命中，从Auth服务获取并缓存
        try {
            dept = authServiceClient.getDeptById(deptId).getData();
            if (dept != null) {
                syncDepartment(deptId);
                return true;
            }
        } catch (Exception e) {
            log.error("验证部门ID失败，部门ID：{}", deptId, e);
        }

        return false;
    }

    @Override
    public boolean validatePostId(Long postId) {
        if (postId == null) {
            return false;
        }

        // 先从缓存获取
        PostVO post = getCachedPost(postId);
        if (post != null) {
            return true;
        }

        // 缓存未命中，从Auth服务获取并缓存
        try {
            post = authServiceClient.getPostById(postId).getData();
            if (post != null) {
                syncPost(postId);
                return true;
            }
        } catch (Exception e) {
            log.error("验证岗位ID失败，岗位ID：{}", postId, e);
        }

        return false;
    }

    @Override
    public DeptVO getCachedDept(Long deptId) {
        if (deptId == null) {
            return null;
        }

        String cacheKey = DEPT_CACHE_KEY + deptId;
        return redisCache.getCacheObject(cacheKey);
    }

    @Override
    public PostVO getCachedPost(Long postId) {
        if (postId == null) {
            return null;
        }

        String cacheKey = POST_CACHE_KEY + postId;
        return redisCache.getCacheObject(cacheKey);
    }

    @Override
    public List<DeptVO> getCachedDeptTree() {
        List<DeptVO> deptTree = redisCache.getCacheObject(DEPT_TREE_CACHE_KEY);
        
        // 如果缓存为空，尝试同步
        if (deptTree == null || deptTree.isEmpty()) {
            log.info("部门树缓存为空，尝试同步");
            syncDepartments();
            deptTree = redisCache.getCacheObject(DEPT_TREE_CACHE_KEY);
        }
        
        return deptTree != null ? deptTree : new ArrayList<>();
    }

    @Override
    public void clearDeptCache(Long deptId) {
        if (deptId == null) {
            return;
        }

        String cacheKey = DEPT_CACHE_KEY + deptId;
        redisCache.deleteObject(cacheKey);
        log.info("清除部门缓存，部门ID：{}", deptId);
    }

    @Override
    public void clearPostCache(Long postId) {
        if (postId == null) {
            return;
        }

        String cacheKey = POST_CACHE_KEY + postId;
        redisCache.deleteObject(cacheKey);
        log.info("清除岗位缓存，岗位ID：{}", postId);
    }

    @Override
    public void clearAllCache() {
        log.info("清除所有部门岗位缓存");
        
        // 清除部门树缓存
        redisCache.deleteObject(DEPT_TREE_CACHE_KEY);
        
        // 清除岗位列表缓存
        redisCache.deleteObject(POST_LIST_CACHE_KEY);
        
        log.info("清除所有部门岗位缓存完成");
    }

    /**
     * 递归缓存部门树
     * 
     * @param deptList 部门列表
     * @return 缓存的部门数量
     */
    private int cacheDeptTreeRecursive(List<DeptTreeVO> deptList) {
        if (deptList == null || deptList.isEmpty()) {
            return 0;
        }

        int count = 0;
        for (DeptTreeVO dept : deptList) {
            // 将DeptTreeVO转换为DeptVO并缓存
            DeptVO deptVO = new DeptVO();
            deptVO.setDeptId(dept.getDeptId());
            deptVO.setParentId(dept.getParentId());
            deptVO.setDeptName(dept.getDeptName());
            deptVO.setOrderNum(dept.getOrderNum());
            deptVO.setLeader(dept.getLeader());
            deptVO.setStatus(dept.getStatus());
            
            String cacheKey = DEPT_CACHE_KEY + dept.getDeptId();
            redisCache.setCacheObject(cacheKey, deptVO, CACHE_EXPIRE_HOURS, TimeUnit.HOURS);
            count++;

            // 递归缓存子部门
            if (dept.getChildren() != null && !dept.getChildren().isEmpty()) {
                count += cacheDeptTreeRecursive(dept.getChildren());
            }
        }

        return count;
    }
}
