package com.cloudflow.oa.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.sensitive.utils.SensitiveUtils;
import com.cloudflow.oa.domain.vo.DynamicMapVO;
import com.cloudflow.oa.mapper.ContactMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import cn.dev33.satoken.annotation.SaCheckLogin;
import cn.dev33.satoken.annotation.SaCheckPermission;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 通讯录/企业黄页 Controller
 * 复用已有的 sys_user 和 sys_dept 表数据，提供面向普通员工的通讯录查询功能。
 * 前端请求路径：/oa/contact/xxx → 网关 StripPrefix=1 → /contact/xxx
 */
@Slf4j
@RestController
@RequestMapping("/contact")
@SaCheckLogin
@RequiredArgsConstructor
public class ContactController {

    private static final int MAX_PAGE_SIZE = 100;

    private final ContactMapper contactMapper;

    /**
     * 查询通讯录列表（支持按姓名、部门、职位搜索）。
     * 返回统一脱敏后的联系信息。
     */
    @GetMapping("/list")
    @SaCheckPermission("office:contact:list")
    public R<DynamicMapVO> list(@RequestParam(value = "keyword", required = false) String keyword,
                                @RequestParam(value = "deptId", required = false) Long deptId,
                                @RequestParam(value = "pageNum", defaultValue = "1") Integer pageNum,
                                @RequestParam(value = "pageSize", defaultValue = "20") Integer pageSize) {
        int current = normalizePageNum(pageNum);
        int size = normalizePageSize(pageSize);
        String normalizedKeyword = normalizeKeyword(keyword);
        int total = contactMapper.countContacts(normalizedKeyword, deptId);
        List<Map<String, Object>> records = contactMapper.selectContacts(
                normalizedKeyword,
                deptId,
                (current - 1) * size,
                size
        )
            .stream()
            .map(SensitiveUtils::maskMap)
            .collect(Collectors.toList());

        Map<String, Object> result = new HashMap<>();
        result.put("records", records);
        result.put("total", total);
        result.put("current", current);
        result.put("size", size);

        return R.ok(DynamicMapVO.from(result));
    }

    /**
     * 查询部门树（通讯录左侧部门导航用）。
     */
    @GetMapping("/dept/tree")
    @SaCheckPermission("office:contact:list")
    public R<List<DynamicMapVO>> deptTree() {
        List<DynamicMapVO> depts = contactMapper.selectDeptTree()
            .stream()
            .map(SensitiveUtils::maskMap)
            .map(DynamicMapVO::from)
            .collect(Collectors.toList());
        return R.ok(depts);
    }

    /**
     * 查询用户详情（通讯录详情卡片）。
     */
    @GetMapping("/user/{userId}")
    @SaCheckPermission("office:contact:list")
    public R<DynamicMapVO> getUserDetail(@PathVariable("userId") Long userId) {
        Map<String, Object> user = contactMapper.selectUserDetail(userId);
        if (user == null || user.isEmpty()) {
            return R.fail("用户不存在");
        }
        return R.ok(DynamicMapVO.from(SensitiveUtils.maskMap(user)));
    }

    private String normalizeKeyword(String keyword) {
        if (keyword == null || keyword.trim().isEmpty()) {
            return null;
        }
        return keyword.trim();
    }

    private int normalizePageNum(Integer pageNum) {
        return pageNum == null || pageNum < 1 ? 1 : pageNum;
    }

    private int normalizePageSize(Integer pageSize) {
        if (pageSize == null || pageSize < 1) {
            return 20;
        }
        return Math.min(pageSize, MAX_PAGE_SIZE);
    }
}
