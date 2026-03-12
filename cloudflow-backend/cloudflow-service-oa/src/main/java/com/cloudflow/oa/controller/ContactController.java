package com.cloudflow.oa.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.sensitive.utils.SensitiveUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
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
@RequiredArgsConstructor
public class ContactController {

    private final JdbcTemplate jdbcTemplate;

    /**
     * 查询通讯录列表（支持按姓名、部门、职位搜索）。
     * 返回统一脱敏后的联系信息。
     */
    @GetMapping("/list")
    public R list(@RequestParam(value = "keyword", required = false) String keyword,
                  @RequestParam(value = "deptId", required = false) Long deptId,
                  @RequestParam(value = "pageNum", defaultValue = "1") Integer pageNum,
                  @RequestParam(value = "pageSize", defaultValue = "20") Integer pageSize) {
        StringBuilder sql = new StringBuilder();
        sql.append("SELECT u.user_id, u.nick_name, u.user_name, u.email, u.phonenumber, ");
        sql.append("u.sex, u.avatar, u.status, ");
        sql.append("d.dept_id, d.dept_name, ");
        sql.append("p.post_name ");
        sql.append("FROM sys_user u ");
        sql.append("LEFT JOIN sys_dept d ON u.dept_id = d.dept_id ");
        sql.append("LEFT JOIN sys_user_post up ON u.user_id = up.user_id ");
        sql.append("LEFT JOIN sys_post p ON up.post_id = p.post_id ");
        sql.append("WHERE u.del_flag = '0' AND u.status = '0' ");

        if (keyword != null && !keyword.trim().isEmpty()) {
            sql.append("AND (u.nick_name LIKE '%").append(keyword).append("%' ");
            sql.append("OR u.user_name LIKE '%").append(keyword).append("%' ");
            sql.append("OR u.phonenumber LIKE '%").append(keyword).append("%') ");
        }

        if (deptId != null) {
            sql.append("AND u.dept_id = ").append(deptId).append(" ");
        }

        String countSql = "SELECT COUNT(*) FROM (" + sql + ") t";
        Integer total = jdbcTemplate.queryForObject(countSql, Integer.class);

        sql.append("ORDER BY d.order_num, u.user_id ");
        sql.append("LIMIT ").append((pageNum - 1) * pageSize).append(", ").append(pageSize);

        List<Map<String, Object>> records = jdbcTemplate.queryForList(sql.toString())
            .stream()
            .map(SensitiveUtils::maskMap)
            .collect(Collectors.toList());

        Map<String, Object> result = new HashMap<>();
        result.put("records", records);
        result.put("total", total != null ? total : 0);
        result.put("current", pageNum);
        result.put("size", pageSize);

        return R.ok(result);
    }

    /**
     * 查询部门树（通讯录左侧部门导航用）。
     */
    @GetMapping("/dept/tree")
    public R deptTree() {
        String sql = "SELECT dept_id, parent_id, dept_name, order_num, leader, phone, email "
            + "FROM sys_dept WHERE del_flag = '0' AND status = '0' ORDER BY parent_id, order_num";
        List<Map<String, Object>> depts = jdbcTemplate.queryForList(sql)
            .stream()
            .map(SensitiveUtils::maskMap)
            .collect(Collectors.toList());
        return R.ok(depts);
    }

    /**
     * 查询用户详情（通讯录详情卡片）。
     */
    @GetMapping("/user/{userId}")
    public R getUserDetail(@PathVariable("userId") Long userId) {
        String sql = "SELECT u.user_id, u.nick_name, u.user_name, u.email, u.phonenumber, "
            + "u.sex, u.avatar, u.status, u.remark, "
            + "d.dept_id, d.dept_name, "
            + "p.post_name "
            + "FROM sys_user u "
            + "LEFT JOIN sys_dept d ON u.dept_id = d.dept_id "
            + "LEFT JOIN sys_user_post up ON u.user_id = up.user_id "
            + "LEFT JOIN sys_post p ON up.post_id = p.post_id "
            + "WHERE u.user_id = ? AND u.del_flag = '0'";
        List<Map<String, Object>> results = jdbcTemplate.queryForList(sql, userId);
        if (results.isEmpty()) {
            return R.fail("用户不存在");
        }
        return R.ok(SensitiveUtils.maskMap(results.get(0)));
    }
}
