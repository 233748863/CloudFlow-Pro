package com.cloudflow.auth.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.auth.domain.SysPost;
import com.cloudflow.auth.service.ISysPostService;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.Arrays;
import java.time.LocalDateTime;
import com.fasterxml.jackson.annotation.JsonFormat;
import java.util.List;

/**
 * 岗位信息管理控制器
 *
 * @author CloudFlow
 */
@RestController
@RequestMapping("/system/post")
@RequiredArgsConstructor
public class SysPostController {

    private final ISysPostService sysPostService;

    /**
     * 分页查询岗位列表
     *
     * @param postCode 岗位编码（模糊查询）
     * @param postName 岗位名称（模糊查询）
     * @param status   状态
     * @param pageNum  页码
     * @param pageSize 每页条数
     */
    @GetMapping("/list")
    @SaCheckPermission("system:post:list")
    public R<Page<SysPost>> list(
            @RequestParam(required = false) String postCode,
            @RequestParam(required = false) String postName,
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "1") Integer pageNum,
            @RequestParam(defaultValue = "10") Integer pageSize) {
        LambdaQueryWrapper<SysPost> wrapper = new LambdaQueryWrapper<>();
        wrapper.like(postCode != null, SysPost::getPostCode, postCode)
                .like(postName != null, SysPost::getPostName, postName)
                .eq(status != null, SysPost::getStatus, status)
                .orderByAsc(SysPost::getPostSort);
        Page<SysPost> page = sysPostService.page(new Page<>(pageNum, pageSize), wrapper);
        return R.ok(page);
    }

    /**
     * 根据 ID 获取岗位详情
     */
    @GetMapping("/{postId}")
    @SaCheckPermission("system:post:query")
    public R<SysPost> getInfo(@PathVariable Long postId) {
        return R.ok(sysPostService.getById(postId));
    }

    /**
     * 新增岗位
     */
    @PostMapping
    @RepeatSubmit
    @SaCheckPermission("system:post:add")
    public R<Void> add(@RequestBody SysPost post) {
        if (!sysPostService.checkPostCodeUnique(post)) {
            return R.fail("新增岗位'" + post.getPostName() + "'失败，岗位编码已存在");
        }
        post.setCreateTime(LocalDateTime.now());
        sysPostService.save(post);
        return R.ok();
    }

    /**
     * 修改岗位
     */
    @PutMapping
    @RepeatSubmit
    @SaCheckPermission("system:post:edit")
    public R<Void> edit(@RequestBody SysPost post) {
        if (!sysPostService.checkPostCodeUnique(post)) {
            return R.fail("修改岗位'" + post.getPostName() + "'失败，岗位编码已存在");
        }
        post.setUpdateTime(LocalDateTime.now());
        sysPostService.updateById(post);
        return R.ok();
    }

    /**
     * 删除岗位（支持批量）
     */
    @DeleteMapping("/{postIds}")
    @SaCheckPermission("system:post:remove")
    public R<Void> remove(@PathVariable Long[] postIds) {
        sysPostService.removeByIds(Arrays.asList(postIds));
        return R.ok();
    }

    /**
     * 获取岗位选择列表（下拉框用，仅返回正常状态的岗位）
     */
    @GetMapping("/optionselect")
    @SaCheckPermission("system:post:list")
    public R<List<SysPost>> optionselect() {
        LambdaQueryWrapper<SysPost> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysPost::getStatus, "0")
                .orderByAsc(SysPost::getPostSort);
        return R.ok(sysPostService.list(wrapper));
    }
}
