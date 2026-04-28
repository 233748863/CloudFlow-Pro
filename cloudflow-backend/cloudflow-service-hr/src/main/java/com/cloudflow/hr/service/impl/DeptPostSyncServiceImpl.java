package com.cloudflow.hr.service.impl;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.utils.RedisCache;
import com.cloudflow.common.core.utils.SecurityUtils;
import com.cloudflow.hr.client.AuthServiceClient;
import com.cloudflow.hr.client.vo.DeptTreeVO;
import com.cloudflow.hr.client.vo.DeptVO;
import com.cloudflow.hr.client.vo.PostVO;
import com.cloudflow.hr.service.DeptPostSyncService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.concurrent.TimeUnit;

@Slf4j
@Service
@RequiredArgsConstructor
public class DeptPostSyncServiceImpl implements DeptPostSyncService {

    private static final String DEPT_CACHE_KEY = "hr:dept:";
    private static final String POST_CACHE_KEY = "hr:post:";
    private static final String DEPT_TREE_CACHE_KEY = "hr:dept:tree";
    private static final String POST_LIST_CACHE_KEY = "hr:post:list";
    private static final long CACHE_EXPIRE_HOURS = 24;

    private final AuthServiceClient authServiceClient;
    private final RedisCache redisCache;

    @Override
    public void syncDepartments() {
        try {
            List<DeptVO> deptTree = convertDeptTree(fetchDeptTreeFromAuth());
            redisCache.setCacheObject(DEPT_TREE_CACHE_KEY, deptTree, CACHE_EXPIRE_HOURS, TimeUnit.HOURS);
            int count = cacheDeptTreeRecursive(deptTree);
            log.info("Synced {} departments into cache", count);
        } catch (Exception e) {
            log.error("Failed to sync departments", e);
            throw new RuntimeException("Failed to sync departments: " + e.getMessage(), e);
        }
    }

    @Override
    public void syncDepartment(Long deptId) {
        try {
            DeptVO dept = fetchDeptFromAuth(deptId);
            redisCache.setCacheObject(DEPT_CACHE_KEY + deptId, dept, CACHE_EXPIRE_HOURS, TimeUnit.HOURS);
        } catch (Exception e) {
            log.error("Failed to sync department {}", deptId, e);
            throw new RuntimeException("Failed to sync department: " + e.getMessage(), e);
        }
    }

    @Override
    public void syncPosts() {
        try {
            List<PostVO> postList = fetchPostListFromAuth();
            redisCache.setCacheObject(POST_LIST_CACHE_KEY, postList, CACHE_EXPIRE_HOURS, TimeUnit.HOURS);
            for (PostVO post : postList) {
                redisCache.setCacheObject(POST_CACHE_KEY + post.getPostId(), post, CACHE_EXPIRE_HOURS, TimeUnit.HOURS);
            }
            log.info("Synced {} posts into cache", postList.size());
        } catch (Exception e) {
            log.error("Failed to sync posts", e);
            throw new RuntimeException("Failed to sync posts: " + e.getMessage(), e);
        }
    }

    @Override
    public void syncPost(Long postId) {
        try {
            PostVO post = fetchPostFromAuth(postId);
            redisCache.setCacheObject(POST_CACHE_KEY + postId, post, CACHE_EXPIRE_HOURS, TimeUnit.HOURS);
        } catch (Exception e) {
            log.error("Failed to sync post {}", postId, e);
            throw new RuntimeException("Failed to sync post: " + e.getMessage(), e);
        }
    }

    @Override
    public boolean validateDeptId(Long deptId) {
        if (deptId == null) {
            return false;
        }
        if (getCachedDept(deptId) != null) {
            return true;
        }
        try {
            syncDepartment(deptId);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    @Override
    public boolean validatePostId(Long postId) {
        if (postId == null) {
            return false;
        }
        if (getCachedPost(postId) != null) {
            return true;
        }
        try {
            syncPost(postId);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    @Override
    public DeptVO getCachedDept(Long deptId) {
        return deptId == null ? null : redisCache.getCacheObject(DEPT_CACHE_KEY + deptId);
    }

    @Override
    public PostVO getCachedPost(Long postId) {
        return postId == null ? null : redisCache.getCacheObject(POST_CACHE_KEY + postId);
    }

    @Override
    public List<DeptVO> getCachedDeptTree() {
        List<DeptVO> deptTree = redisCache.getCacheObject(DEPT_TREE_CACHE_KEY);
        if (deptTree == null || deptTree.isEmpty()) {
            syncDepartments();
            deptTree = redisCache.getCacheObject(DEPT_TREE_CACHE_KEY);
        }
        return deptTree != null ? deptTree : new ArrayList<>();
    }

    @Override
    public void clearDeptCache(Long deptId) {
        if (deptId != null) {
            redisCache.deleteObject(DEPT_CACHE_KEY + deptId);
        }
    }

    @Override
    public void clearPostCache(Long postId) {
        if (postId != null) {
            redisCache.deleteObject(POST_CACHE_KEY + postId);
        }
    }

    @Override
    public void clearAllCache() {
        redisCache.deleteObject(DEPT_TREE_CACHE_KEY);
        redisCache.deleteObject(POST_LIST_CACHE_KEY);
        deleteByPattern(DEPT_CACHE_KEY + "*");
        deleteByPattern(POST_CACHE_KEY + "*");
    }

    private int cacheDeptTreeRecursive(List<DeptVO> deptList) {
        int count = 0;
        for (DeptVO dept : deptList) {
            redisCache.setCacheObject(DEPT_CACHE_KEY + dept.getDeptId(), dept, CACHE_EXPIRE_HOURS, TimeUnit.HOURS);
            count++;
            if (dept.getChildren() != null && !dept.getChildren().isEmpty()) {
                count += cacheDeptTreeRecursive(dept.getChildren());
            }
        }
        return count;
    }

    private List<DeptVO> convertDeptTree(List<DeptTreeVO> deptTree) {
        if (deptTree == null || deptTree.isEmpty()) {
            return new ArrayList<>();
        }
        List<DeptVO> result = new ArrayList<>();
        for (DeptTreeVO dept : deptTree) {
            DeptVO deptVO = new DeptVO();
            deptVO.setDeptId(dept.getDeptId());
            deptVO.setParentId(dept.getParentId());
            deptVO.setDeptName(dept.getDeptName());
            deptVO.setOrderNum(dept.getOrderNum());
            deptVO.setLeader(dept.getLeader());
            deptVO.setStatus(dept.getStatus());
            deptVO.setChildren(convertDeptTree(dept.getChildren()));
            result.add(deptVO);
        }
        return result;
    }

    private List<DeptTreeVO> fetchDeptTreeFromAuth() {
        R<List<DeptTreeVO>> result = authServiceClient.getDeptTree(SecurityUtils.getTenantId());
        if (result == null || !result.isSuccess() || result.getData() == null) {
            throw new RuntimeException("Auth service returned no department tree");
        }
        return result.getData();
    }

    private List<PostVO> fetchPostListFromAuth() {
        R<List<PostVO>> result = authServiceClient.getPostList(SecurityUtils.getTenantId());
        if (result == null || !result.isSuccess() || result.getData() == null) {
            throw new RuntimeException("Auth service returned no post list");
        }
        return result.getData();
    }

    private DeptVO fetchDeptFromAuth(Long deptId) {
        R<DeptVO> result = authServiceClient.getDeptById(deptId);
        if (result == null || !result.isSuccess() || result.getData() == null) {
            throw new RuntimeException("Auth service returned no department");
        }
        return result.getData();
    }

    private PostVO fetchPostFromAuth(Long postId) {
        R<PostVO> result = authServiceClient.getPostById(postId);
        if (result == null || !result.isSuccess() || result.getData() == null) {
            throw new RuntimeException("Auth service returned no post");
        }
        return result.getData();
    }

    private void deleteByPattern(String pattern) {
        Collection<String> keys = redisCache.keys(pattern);
        if (keys == null || keys.isEmpty()) {
            return;
        }
        for (String key : keys) {
            redisCache.redisTemplate.delete(key);
        }
    }
}
