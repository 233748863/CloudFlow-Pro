package com.cloudflow.auth.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.auth.domain.SysDept;
import com.cloudflow.auth.util.DeptTreeBuilder;
import com.cloudflow.auth.domain.dto.DeptMigrateRequest;
import com.cloudflow.auth.mapper.SysDeptMapper;
import com.cloudflow.auth.service.SysDeptAdminService;
import com.cloudflow.auth.service.SysDeptLeaderService;
import cn.dev33.satoken.annotation.SaMode;
import com.cloudflow.auth.service.UserDataScopeService;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/system/dept")
public class SysDeptController {

    @Autowired
    private SysDeptMapper sysDeptMapper;

    @Autowired
    private UserDataScopeService userDataScopeService;

    @Autowired
    private SysDeptAdminService sysDeptAdminService;

    @Autowired
    private SysDeptLeaderService deptLeaderService;

    /**
     * 获取部门树
     */
    @GetMapping("/tree")
    @SaCheckPermission("system:dept:list")
    public R<List<SysDept>> getDeptTree() {
        List<SysDept> depts = sysDeptMapper.selectList(new LambdaQueryWrapper<SysDept>()
                .orderByAsc(SysDept::getOrderNum));
        deptLeaderService.fillNames(depts);
        return R.ok(DeptTreeBuilder.build(depts));
    }

    /**
     * 构建部门树
     */
    /**
     * 获取部门详情
     */
    @GetMapping("/{deptId}")
    @SaCheckPermission("system:dept:query")
    public R<SysDept> getById(@PathVariable Long deptId) {
        SysDept dept = sysDeptMapper.selectById(deptId);
        if (dept != null) {
            deptLeaderService.fillNames(List.of(dept));
        }
        return R.ok(dept);
    }

    /**
     * 新增部门
     */
    @PostMapping
    @RepeatSubmit
    @SaCheckPermission("system:dept:add")
    public R<Boolean> add(@RequestBody SysDept dept) {
        deptLeaderService.validate(dept);
        // 设置ancestors
        if (dept.getParentId() != null && dept.getParentId() > 0) {
            SysDept parent = sysDeptMapper.selectById(dept.getParentId());
            if (parent != null) {
                dept.setAncestors(parent.getAncestors() + "," + dept.getParentId());
            }
        } else {
            dept.setAncestors("0");
            dept.setParentId(0L);
        }
        if (dept.getStatus() == null) {
            dept.setStatus("0");
        }
        boolean success = sysDeptMapper.insert(dept) > 0;
        if (success) {
            userDataScopeService.refreshByDeptId(dept.getDeptId());
        }
        return R.ok(success);
    }

    /**
     * 修改部门
     */
    @PutMapping
    @RepeatSubmit
    @SaCheckPermission("system:dept:edit")
    public R<Boolean> edit(@RequestBody SysDept dept) {
        deptLeaderService.validate(dept);
        // 更新ancestors
        if (dept.getParentId() != null && dept.getParentId() > 0) {
            SysDept parent = sysDeptMapper.selectById(dept.getParentId());
            if (parent != null) {
                dept.setAncestors(parent.getAncestors() + "," + dept.getParentId());
            }
        } else {
            dept.setAncestors("0");
        }
        boolean success = sysDeptMapper.updateById(dept) > 0;
        if (success) {
            userDataScopeService.refreshByDeptId(dept.getDeptId());
            if (dept.getParentId() != null) {
                userDataScopeService.refreshByDeptId(dept.getParentId());
            }
        }
        return R.ok(success);
    }

    @GetMapping("/leader-options")
    @SaCheckPermission(value = {"system:dept:add", "system:dept:edit"}, mode = SaMode.OR)
    public R<List<SysDeptLeaderService.LeaderOption>> leaderOptions() {
        return R.ok(deptLeaderService.options());
    }

    @PostMapping("/migrate")
    @RepeatSubmit
    @SaCheckPermission("system:dept:edit")
    public R<Integer> migrate(@RequestBody DeptMigrateRequest request) {
        return R.ok(sysDeptAdminService.migrateUsers(request.getSourceDeptId(), request.getTargetDeptId()));
    }

    /**
     * 删除部门
     */
    @DeleteMapping("/{deptId}")
    @SaCheckPermission("system:dept:remove")
    public R<Boolean> remove(@PathVariable Long deptId) {
        return R.ok(sysDeptAdminService.removeDept(deptId));
    }
}
