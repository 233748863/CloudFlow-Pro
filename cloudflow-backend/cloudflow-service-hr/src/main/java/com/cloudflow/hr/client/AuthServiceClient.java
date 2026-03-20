package com.cloudflow.hr.client;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.client.dto.DeptCreateDTO;
import com.cloudflow.hr.client.dto.PostCreateDTO;
import com.cloudflow.hr.client.dto.UserCreateDTO;
import com.cloudflow.hr.client.dto.UserUpdateDTO;
import com.cloudflow.hr.client.fallback.AuthServiceFallback;
import com.cloudflow.hr.client.vo.DeptTreeVO;
import com.cloudflow.hr.client.vo.DeptVO;
import com.cloudflow.hr.client.vo.PostVO;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Auth服务Feign客户端
 * 用于调用认证服务的部门、岗位、用户管理接口
 *
 * @author CloudFlow
 * @since 1.0.0
 */
@FeignClient(
    name = "cloudflow-service-auth",
    path = "/api/auth",
    fallback = AuthServiceFallback.class
)
public interface AuthServiceClient {
    
    // ==================== 部门管理接口 ====================
    
    /**
     * 获取部门树
     *
     * @param tenantId 租户ID
     * @return 部门树列表
     */
    @GetMapping("/dept/tree")
    R<List<DeptTreeVO>> getDeptTree(@RequestParam("tenantId") Long tenantId);
    
    /**
     * 根据ID获取部门信息
     *
     * @param id 部门ID
     * @return 部门信息
     */
    @GetMapping("/dept/{id}")
    R<DeptVO> getDeptById(@PathVariable("id") Long id);
    
    /**
     * 创建部门
     *
     * @param dto 部门创建DTO
     * @return 部门ID
     */
    @PostMapping("/dept")
    R<Long> createDept(@RequestBody DeptCreateDTO dto);
    
    // ==================== 岗位管理接口 ====================
    
    /**
     * 获取岗位列表
     *
     * @param tenantId 租户ID
     * @return 岗位列表
     */
    @GetMapping("/post/list")
    R<List<PostVO>> getPostList(@RequestParam("tenantId") Long tenantId);
    
    /**
     * 根据ID获取岗位信息
     *
     * @param id 岗位ID
     * @return 岗位信息
     */
    @GetMapping("/post/{id}")
    R<PostVO> getPostById(@PathVariable("id") Long id);
    
    /**
     * 创建岗位
     *
     * @param dto 岗位创建DTO
     * @return 岗位ID
     */
    @PostMapping("/post")
    R<Long> createPost(@RequestBody PostCreateDTO dto);
    
    // ==================== 用户管理接口 ====================
    
    /**
     * 创建用户
     *
     * @param dto 用户创建DTO
     * @return 用户ID
     */
    @PostMapping("/user")
    R<Long> createUser(@RequestBody UserCreateDTO dto);
    
    /**
     * 更新用户信息
     *
     * @param id  用户ID
     * @param dto 用户更新DTO
     * @return 操作结果
     */
    @PutMapping("/user/{id}")
    R<Void> updateUser(@PathVariable("id") Long id, @RequestBody UserUpdateDTO dto);
    
    /**
     * 禁用用户（离职时调用）
     *
     * @param id 用户ID
     * @return 操作结果
     */
    @DeleteMapping("/user/{id}")
    R<Void> disableUser(@PathVariable("id") Long id);
}
