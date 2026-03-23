package com.cloudflow.hr.client.fallback;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.client.AuthServiceClient;
import com.cloudflow.hr.client.dto.DeptCreateDTO;
import com.cloudflow.hr.client.dto.PostCreateDTO;
import com.cloudflow.hr.client.dto.UserCreateDTO;
import com.cloudflow.hr.client.dto.UserUpdateDTO;
import com.cloudflow.hr.client.vo.DeptTreeVO;
import com.cloudflow.hr.client.vo.DeptVO;
import com.cloudflow.hr.client.vo.PostVO;
import com.cloudflow.hr.client.vo.UserVO;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.Collections;
import java.util.List;

/**
 * Auth服务降级处理
 * 当Auth服务不可用时，返回降级响应
 *
 * @author CloudFlow
 * @since 1.0.0
 */
@Slf4j
@Component
public class AuthServiceFallback implements AuthServiceClient {
    
    // ==================== 部门管理接口降级 ====================
    
    @Override
    public R<List<DeptTreeVO>> getDeptTree(Long tenantId) {
        log.error("Auth服务调用失败：获取部门树失败，租户ID={}", tenantId);
        return R.fail("Auth服务暂时不可用，无法获取部门树");
    }
    
    @Override
    public R<DeptVO> getDeptById(Long id) {
        log.error("Auth服务调用失败：获取部门信息失败，部门ID={}", id);
        return R.fail("Auth服务暂时不可用，无法获取部门信息");
    }
    
    @Override
    public R<Long> createDept(DeptCreateDTO dto) {
        log.error("Auth服务调用失败：创建部门失败，部门名称={}", dto.getDeptName());
        return R.fail("Auth服务暂时不可用，无法创建部门");
    }
    
    // ==================== 岗位管理接口降级 ====================
    
    @Override
    public R<List<PostVO>> getPostList(Long tenantId) {
        log.error("Auth服务调用失败：获取岗位列表失败，租户ID={}", tenantId);
        return R.fail("Auth服务暂时不可用，无法获取岗位列表");
    }
    
    @Override
    public R<PostVO> getPostById(Long id) {
        log.error("Auth服务调用失败：获取岗位信息失败，岗位ID={}", id);
        return R.fail("Auth服务暂时不可用，无法获取岗位信息");
    }
    
    @Override
    public R<Long> createPost(PostCreateDTO dto) {
        log.error("Auth服务调用失败：创建岗位失败，岗位名称={}", dto.getPostName());
        return R.fail("Auth服务暂时不可用，无法创建岗位");
    }
    
    // ==================== 用户管理接口降级 ====================
    
    @Override
    public R<Long> createUser(UserCreateDTO dto) {
        log.error("Auth服务调用失败：创建用户失败，用户名={}", dto.getUserName());
        return R.fail("Auth服务暂时不可用，无法创建用户账号，请稍后重试");
    }
    
    @Override
    public R<UserVO> getUserById(Long id) {
        log.error("Auth鏈嶅姟璋冪敤澶辫触锛氳幏鍙栫敤鎴蜂俊鎭け璐ワ紝鐢ㄦ埛ID={}", id);
        return R.fail("Auth鏈嶅姟鏆傛椂涓嶅彲鐢紝鏃犳硶鑾峰彇鐢ㄦ埛淇℃伅");
    }

    @Override
    public R<List<UserVO>> batchGetUsers(List<Long> userIds) {
        log.error("Auth鏈嶅姟璋冪敤澶辫触锛氭壒閲忚幏鍙栫敤鎴蜂俊鎭け璐ワ紝鐢ㄦ埛ID鍒楄〃={}", userIds);
        return R.fail("Auth鏈嶅姟鏆傛椂涓嶅彲鐢紝鏃犳硶鎵归噺鑾峰彇鐢ㄦ埛淇℃伅");
    }

    @Override
    public R<Void> updateUser(Long id, UserUpdateDTO dto) {
        log.error("Auth服务调用失败：更新用户信息失败，用户ID={}", id);
        return R.fail("Auth服务暂时不可用，无法更新用户信息，请稍后重试");
    }
    
    @Override
    public R<Void> disableUser(Long id) {
        log.error("Auth服务调用失败：禁用用户失败，用户ID={}", id);
        return R.fail("Auth服务暂时不可用，无法禁用用户账号，请稍后重试");
    }
}
