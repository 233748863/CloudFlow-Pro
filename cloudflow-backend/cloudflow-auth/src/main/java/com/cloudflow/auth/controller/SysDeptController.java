package com.cloudflow.auth.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.auth.domain.SysDept;
import com.cloudflow.auth.mapper.SysDeptMapper;
import com.cloudflow.common.core.domain.R;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/system/dept")
public class SysDeptController {

    @Autowired
    private SysDeptMapper sysDeptMapper;

    /**
     * 获取部门树
     */
    @GetMapping("/tree")
    @SaCheckPermission("system:dept:list")
    public R<List<SysDept>> getDeptTree() {
        List<SysDept> depts = sysDeptMapper.selectList(new LambdaQueryWrapper<SysDept>()
                .orderByAsc(SysDept::getOrderNum));
        return R.ok(buildDeptTree(depts));
    }

    /**
     * 构建部门树
     */
    private List<SysDept> buildDeptTree(List<SysDept> depts) {
        List<SysDept> returnList = new ArrayList<>();
        List<Long> tempList = new ArrayList<>();
        for (SysDept dept : depts) {
            tempList.add(dept.getDeptId());
        }
        for (SysDept dept : depts) {
            // 如果是顶级节点, 遍历该父节点的所有子节点
            if (!tempList.contains(dept.getParentId())) {
                recursionFn(depts, dept);
                returnList.add(dept);
            }
        }
        if (returnList.isEmpty()) {
            returnList = depts;
        }
        return returnList;
    }

    /**
     * 递归列表
     */
    private void recursionFn(List<SysDept> list, SysDept t) {
        // 得到子节点列表
        List<SysDept> childList = getChildList(list, t);
        t.setChildren(childList);
        for (SysDept tChild : childList) {
            if (hasChild(list, tChild)) {
                recursionFn(list, tChild);
            }
        }
    }

    /**
     * 得到子节点列表
     */
    private List<SysDept> getChildList(List<SysDept> list, SysDept t) {
        List<SysDept> tlist = new ArrayList<>();
        Iterator<SysDept> it = list.iterator();
        while (it.hasNext()) {
            SysDept n = it.next();
            if (n.getParentId() != null && n.getParentId().longValue() == t.getDeptId().longValue()) {
                tlist.add(n);
            }
        }
        return tlist;
    }

    /**
     * 判断是否有子节点
     */
    private boolean hasChild(List<SysDept> list, SysDept t) {
        return getChildList(list, t).size() > 0;
    }

    /**
     * 获取部门详情
     */
    @GetMapping("/{deptId}")
    @SaCheckPermission("system:dept:query")
    public R<SysDept> getById(@PathVariable Long deptId) {
        return R.ok(sysDeptMapper.selectById(deptId));
    }

    /**
     * 新增部门
     */
    @PostMapping
    @SaCheckPermission("system:dept:add")
    public R<Boolean> add(@RequestBody SysDept dept) {
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
        return R.ok(sysDeptMapper.insert(dept) > 0);
    }

    /**
     * 修改部门
     */
    @PutMapping
    @SaCheckPermission("system:dept:edit")
    public R<Boolean> edit(@RequestBody SysDept dept) {
        // 更新ancestors
        if (dept.getParentId() != null && dept.getParentId() > 0) {
            SysDept parent = sysDeptMapper.selectById(dept.getParentId());
            if (parent != null) {
                dept.setAncestors(parent.getAncestors() + "," + dept.getParentId());
            }
        } else {
            dept.setAncestors("0");
        }
        return R.ok(sysDeptMapper.updateById(dept) > 0);
    }

    /**
     * 删除部门
     */
    @DeleteMapping("/{deptId}")
    @SaCheckPermission("system:dept:remove")
    public R<Boolean> remove(@PathVariable Long deptId) {
        // 检查是否有子部门
        Long childCount = sysDeptMapper.selectCount(new LambdaQueryWrapper<SysDept>()
                .eq(SysDept::getParentId, deptId));
        if (childCount > 0) {
            return R.fail("存在子部门，不允许删除");
        }
        return R.ok(sysDeptMapper.deleteById(deptId) > 0);
    }
}
