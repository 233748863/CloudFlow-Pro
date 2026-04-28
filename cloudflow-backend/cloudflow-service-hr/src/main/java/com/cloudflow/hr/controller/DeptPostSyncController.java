package com.cloudflow.hr.controller;

import com.cloudflow.hr.client.vo.DeptVO;
import com.cloudflow.hr.client.vo.PostVO;
import com.cloudflow.hr.service.DeptPostSyncService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/sync")
@RequiredArgsConstructor
public class DeptPostSyncController {

    private final DeptPostSyncService deptPostSyncService;

    @PostMapping("/departments")
    public Map<String, Object> syncDepartments() {
        return execute("Department sync succeeded", () -> deptPostSyncService.syncDepartments());
    }

    @PostMapping("/department/{deptId}")
    public Map<String, Object> syncDepartment(@PathVariable Long deptId) {
        return execute("Department sync succeeded", () -> deptPostSyncService.syncDepartment(deptId));
    }

    @PostMapping("/posts")
    public Map<String, Object> syncPosts() {
        return execute("Post sync succeeded", () -> deptPostSyncService.syncPosts());
    }

    @PostMapping("/post/{postId}")
    public Map<String, Object> syncPost(@PathVariable Long postId) {
        return execute("Post sync succeeded", () -> deptPostSyncService.syncPost(postId));
    }

    @GetMapping("/department/{deptId}")
    public Map<String, Object> getCachedDept(@PathVariable Long deptId) {
        Map<String, Object> result = new HashMap<>();
        DeptVO dept = deptPostSyncService.getCachedDept(deptId);
        result.put("success", dept != null);
        if (dept != null) {
            result.put("data", dept);
        } else {
            result.put("message", "Department cache not found");
        }
        return result;
    }

    @GetMapping("/post/{postId}")
    public Map<String, Object> getCachedPost(@PathVariable Long postId) {
        Map<String, Object> result = new HashMap<>();
        PostVO post = deptPostSyncService.getCachedPost(postId);
        result.put("success", post != null);
        if (post != null) {
            result.put("data", post);
        } else {
            result.put("message", "Post cache not found");
        }
        return result;
    }

    @GetMapping("/departments/tree")
    public Map<String, Object> getCachedDeptTree() {
        List<DeptVO> deptTree = deptPostSyncService.getCachedDeptTree();
        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        result.put("data", deptTree);
        result.put("count", deptTree.size());
        return result;
    }

    @DeleteMapping("/department/{deptId}")
    public Map<String, Object> clearDeptCache(@PathVariable Long deptId) {
        return execute("Department cache cleared", () -> deptPostSyncService.clearDeptCache(deptId));
    }

    @DeleteMapping("/post/{postId}")
    public Map<String, Object> clearPostCache(@PathVariable Long postId) {
        return execute("Post cache cleared", () -> deptPostSyncService.clearPostCache(postId));
    }

    @DeleteMapping("/all")
    public Map<String, Object> clearAllCache() {
        return execute("All cache cleared", deptPostSyncService::clearAllCache);
    }

    @GetMapping("/validate/department/{deptId}")
    public Map<String, Object> validateDeptId(@PathVariable Long deptId) {
        boolean valid = deptPostSyncService.validateDeptId(deptId);
        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        result.put("valid", valid);
        return result;
    }

    @GetMapping("/validate/post/{postId}")
    public Map<String, Object> validatePostId(@PathVariable Long postId) {
        boolean valid = deptPostSyncService.validatePostId(postId);
        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        result.put("valid", valid);
        return result;
    }

    private Map<String, Object> execute(String successMessage, Runnable action) {
        Map<String, Object> result = new HashMap<>();
        try {
            action.run();
            result.put("success", true);
            result.put("message", successMessage);
        } catch (Exception e) {
            log.error("Dept/post sync operation failed", e);
            result.put("success", false);
            result.put("message", e.getMessage());
        }
        return result;
    }
}
