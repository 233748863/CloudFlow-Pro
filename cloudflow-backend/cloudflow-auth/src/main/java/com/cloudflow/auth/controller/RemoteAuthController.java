package com.cloudflow.auth.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.auth.domain.SysDept;
import com.cloudflow.auth.domain.SysPost;
import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.auth.mapper.SysDeptMapper;
import com.cloudflow.auth.service.ISysPostService;
import com.cloudflow.auth.service.ISysUserService;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.security.annotation.Inner;
import lombok.RequiredArgsConstructor;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;

/**
 * Auth 对外提供的内部远程调用接口。
 * 仅供业务服务做内部调用，避免业务服务直接绑定到 Auth 的后台管理接口与登录态。
 */
@RestController
@RequestMapping("/inner/auth")
@RequiredArgsConstructor
public class RemoteAuthController {

    private static final String HR_SERVICE = "cloudflow-service-hr";

    private final SysDeptMapper sysDeptMapper;
    private final ISysPostService postService;
    private final ISysUserService userService;

    @Inner(allowedServices = {HR_SERVICE})
    @GetMapping("/dept/tree")
    public R<List<SysDept>> getDeptTree(@RequestParam(value = "tenantId", required = false) Long tenantId) {
        List<SysDept> depts = sysDeptMapper.selectList(new LambdaQueryWrapper<SysDept>()
                .orderByAsc(SysDept::getOrderNum));
        return R.ok(buildDeptTree(depts));
    }

    @Inner(allowedServices = {HR_SERVICE})
    @GetMapping("/dept/{deptId}")
    public R<SysDept> getDeptById(@PathVariable Long deptId) {
        return R.ok(sysDeptMapper.selectById(deptId));
    }

    @Inner(allowedServices = {HR_SERVICE})
    @PostMapping("/dept")
    public R<Long> createDept(@RequestBody SysDept dept) {
        if (dept.getParentId() != null && dept.getParentId() > 0) {
            SysDept parent = sysDeptMapper.selectById(dept.getParentId());
            if (parent != null) {
                dept.setAncestors(parent.getAncestors() + "," + dept.getParentId());
            }
        } else {
            dept.setAncestors("0");
            dept.setParentId(0L);
        }
        if (!StringUtils.hasText(dept.getStatus())) {
            dept.setStatus("0");
        }
        sysDeptMapper.insert(dept);
        return R.ok(dept.getDeptId());
    }

    @Inner(allowedServices = {HR_SERVICE})
    @GetMapping("/post/list")
    public R<List<SysPost>> getPostList(@RequestParam(value = "tenantId", required = false) Long tenantId) {
        List<SysPost> posts = postService.list(new LambdaQueryWrapper<SysPost>()
                .orderByAsc(SysPost::getPostSort));
        return R.ok(posts);
    }

    @Inner(allowedServices = {HR_SERVICE})
    @GetMapping("/post/{postId}")
    public R<SysPost> getPostById(@PathVariable Long postId) {
        return R.ok(postService.getById(postId));
    }

    @Inner(allowedServices = {HR_SERVICE})
    @PostMapping("/post")
    public R<Long> createPost(@RequestBody SysPost post) {
        if (!postService.checkPostCodeUnique(post)) {
            return R.fail("岗位编码已存在");
        }
        if (!StringUtils.hasText(post.getStatus())) {
            post.setStatus("0");
        }
        postService.save(post);
        return R.ok(post.getPostId());
    }

    @Inner(allowedServices = {HR_SERVICE})
    @GetMapping("/user/{userId}")
    public R<SysUser> getUser(@PathVariable Long userId) {
        return R.ok(userService.selectUserById(userId));
    }

    @Inner(allowedServices = {HR_SERVICE})
    @GetMapping("/user/by-username")
    public R<SysUser> getUserByUserName(@RequestParam String userName) {
        return R.ok(userService.selectUserByUserName(userName));
    }

    @Inner(allowedServices = {HR_SERVICE})
    @PostMapping("/user/batch")
    public R<List<SysUser>> batchGetUsers(@RequestBody List<Long> userIds) {
        return R.ok(userService.selectUserByIds(userIds));
    }

    @Inner(allowedServices = {HR_SERVICE})
    @PostMapping("/user")
    public R<Long> createUser(@RequestBody SysUser user) {
        if (!StringUtils.hasText(user.getStatus())) {
            user.setStatus("0");
        }
        userService.insertUser(user);
        return R.ok(user.getUserId());
    }

    @Inner(allowedServices = {HR_SERVICE})
    @PutMapping("/user/{userId}")
    public R<Void> updateUser(@PathVariable Long userId, @RequestBody SysUser request) {
        SysUser existing = userService.selectUserById(userId);
        if (existing == null) {
            return R.fail("用户不存在");
        }

        if (Boolean.TRUE.equals(request.getForceDeptSync())) {
            existing.setDeptId(request.getDeptId());
        } else if (request.getDeptId() != null) {
            existing.setDeptId(request.getDeptId());
        }
        if (request.getNickName() != null) {
            existing.setNickName(request.getNickName());
        }
        if (request.getEmail() != null) {
            existing.setEmail(request.getEmail());
        }
        if (request.getPhonenumber() != null) {
            existing.setPhonenumber(request.getPhonenumber());
        }
        if (request.getSex() != null) {
            existing.setSex(request.getSex());
        }
        if (request.getStatus() != null) {
            existing.setStatus(request.getStatus());
        }
        if (request.getRoleIds() != null) {
            existing.setRoleIds(request.getRoleIds());
        }
        if (request.getPostIds() != null) {
            existing.setPostIds(request.getPostIds());
        }
        if (StringUtils.hasText(request.getPassword())) {
            existing.setPassword(request.getPassword());
        }

        userService.updateUser(existing);
        return R.ok();
    }

    @Inner(allowedServices = {HR_SERVICE})
    @DeleteMapping("/user/{userId}")
    public R<Void> disableUser(@PathVariable Long userId) {
        SysUser existing = userService.selectUserById(userId);
        if (existing == null) {
            return R.fail("用户不存在");
        }

        existing.setStatus("1");
        userService.updateUser(existing);
        return R.ok();
    }

    private List<SysDept> buildDeptTree(List<SysDept> depts) {
        List<SysDept> rootList = new ArrayList<>();
        List<Long> deptIds = new ArrayList<>();
        for (SysDept dept : depts) {
            deptIds.add(dept.getDeptId());
        }
        for (SysDept dept : depts) {
            if (!deptIds.contains(dept.getParentId())) {
                recursionFn(depts, dept);
                rootList.add(dept);
            }
        }
        return rootList.isEmpty() ? depts : rootList;
    }

    private void recursionFn(List<SysDept> list, SysDept current) {
        List<SysDept> children = getChildList(list, current);
        current.setChildren(children);
        for (SysDept child : children) {
            if (hasChild(list, child)) {
                recursionFn(list, child);
            }
        }
    }

    private List<SysDept> getChildList(List<SysDept> list, SysDept current) {
        List<SysDept> children = new ArrayList<>();
        Iterator<SysDept> iterator = list.iterator();
        while (iterator.hasNext()) {
            SysDept item = iterator.next();
            if (item.getParentId() != null && item.getParentId().longValue() == current.getDeptId().longValue()) {
                children.add(item);
            }
        }
        return children;
    }

    private boolean hasChild(List<SysDept> list, SysDept current) {
        return !getChildList(list, current).isEmpty();
    }
}
