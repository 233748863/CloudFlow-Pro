package com.cloudflow.auth.service.impl;

import com.cloudflow.auth.domain.SysDept;
import com.cloudflow.auth.domain.SysMenu;
import com.cloudflow.auth.util.DeptTreeBuilder;
import org.junit.jupiter.api.Test;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;

class TreeBuilderTest {
    private SysDept dept(long id, long parentId) {
        SysDept dept = new SysDept();
        dept.setDeptId(id);
        dept.setParentId(parentId);
        return dept;
    }

    @Test
    void departmentTreePreservesInputOrderAndMissingParentRoots() {
        SysDept root = dept(1, 0);
        SysDept second = dept(3, 1);
        SysDept first = dept(2, 1);
        SysDept orphan = dept(4, 99);
        SysDept leaf = dept(5, 3);
        assertEquals(List.of(root, orphan), DeptTreeBuilder.build(List.of(root, second, first, orphan, leaf)));
        assertEquals(List.of(second, first), root.getChildren());
        assertEquals(List.of(leaf), second.getChildren());
        assertTrue(leaf.getChildren().isEmpty());
        SysDept cycleA = dept(10, 11);
        SysDept cycleB = dept(11, 10);
        List<SysDept> cycle = List.of(cycleA, cycleB);
        assertSame(cycle, DeptTreeBuilder.build(cycle));
        assertTrue(cycleA.getChildren().isEmpty());
    }

    @Test
    void menuTreeUsesRequestedRootAndPreservesChildOrder() {
        SysMenu root = new SysMenu(); root.setMenuId(10L); root.setParentId(0L);
        SysMenu a = new SysMenu(); a.setMenuId(12L); a.setParentId(10L);
        SysMenu b = new SysMenu(); b.setMenuId(11L); b.setParentId(10L);
        SysMenu orphan = new SysMenu(); orphan.setMenuId(13L); orphan.setParentId(99L);
        assertEquals(List.of(root), new SysMenuServiceImpl().getChildPerms(List.of(root, a, b, orphan), 0));
        assertEquals(List.of(a, b), root.getChildren());
        assertTrue(a.getChildren().isEmpty());
    }
}
