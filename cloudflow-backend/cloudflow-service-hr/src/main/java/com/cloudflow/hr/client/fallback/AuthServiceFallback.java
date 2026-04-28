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

import java.util.List;

@Slf4j
@Component
public class AuthServiceFallback implements AuthServiceClient {

    @Override
    public R<List<DeptTreeVO>> getDeptTree(Long tenantId) {
        log.error("Auth fallback: get dept tree failed, tenantId={}", tenantId);
        return R.fail("Auth service unavailable, failed to get department tree");
    }

    @Override
    public R<DeptVO> getDeptById(Long id) {
        log.error("Auth fallback: get dept failed, deptId={}", id);
        return R.fail("Auth service unavailable, failed to get department");
    }

    @Override
    public R<Long> createDept(DeptCreateDTO dto) {
        log.error("Auth fallback: create dept failed, deptName={}", dto.getDeptName());
        return R.fail("Auth service unavailable, failed to create department");
    }

    @Override
    public R<List<PostVO>> getPostList(Long tenantId) {
        log.error("Auth fallback: get post list failed, tenantId={}", tenantId);
        return R.fail("Auth service unavailable, failed to get posts");
    }

    @Override
    public R<PostVO> getPostById(Long id) {
        log.error("Auth fallback: get post failed, postId={}", id);
        return R.fail("Auth service unavailable, failed to get post");
    }

    @Override
    public R<Long> createPost(PostCreateDTO dto) {
        log.error("Auth fallback: create post failed, postName={}", dto.getPostName());
        return R.fail("Auth service unavailable, failed to create post");
    }

    @Override
    public R<Long> createUser(UserCreateDTO dto) {
        log.error("Auth fallback: create user failed, userName={}", dto.getUserName());
        return R.fail("Auth service unavailable, failed to create user");
    }

    @Override
    public R<UserVO> getUserById(Long id) {
        log.error("Auth fallback: get user failed, userId={}", id);
        return R.fail("Auth service unavailable, failed to get user");
    }

    @Override
    public R<UserVO> getUserByUserName(String userName) {
        log.error("Auth fallback: get user by name failed, userName={}", userName);
        return R.fail("Auth service unavailable, failed to get user by name");
    }

    @Override
    public R<List<UserVO>> batchGetUsers(List<Long> userIds) {
        log.error("Auth fallback: batch get users failed, userIds={}", userIds);
        return R.fail("Auth service unavailable, failed to batch get users");
    }

    @Override
    public R<Void> updateUser(Long id, UserUpdateDTO dto) {
        log.error("Auth fallback: update user failed, userId={}", id);
        return R.fail("Auth service unavailable, failed to update user");
    }

    @Override
    public R<Void> disableUser(Long id) {
        log.error("Auth fallback: disable user failed, userId={}", id);
        return R.fail("Auth service unavailable, failed to disable user");
    }
}
