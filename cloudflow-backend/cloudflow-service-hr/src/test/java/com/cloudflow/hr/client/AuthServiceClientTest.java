package com.cloudflow.hr.client;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.client.dto.DeptCreateDTO;
import com.cloudflow.hr.client.dto.UserCreateDTO;
import com.cloudflow.hr.client.fallback.AuthServiceFallback;
import com.cloudflow.hr.client.vo.DeptTreeVO;
import com.cloudflow.hr.client.vo.DeptVO;
import com.cloudflow.hr.client.vo.PostVO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@DisplayName("Auth 服务客户端测试")
class AuthServiceClientTest {

    @Mock
    private AuthServiceClient authServiceClient;

    private AuthServiceFallback authServiceFallback;

    private static final Long TEST_TENANT_ID = 1L;
    private static final Long TEST_DEPT_ID = 100L;
    private static final Long TEST_POST_ID = 200L;
    private static final Long TEST_USER_ID = 300L;

    @BeforeEach
    void setUp() {
        authServiceFallback = new AuthServiceFallback();
    }

    @Test
    @DisplayName("获取部门树成功")
    void testGetDeptTreeSuccess() {
        DeptTreeVO deptTree = new DeptTreeVO();
        deptTree.setDeptId(TEST_DEPT_ID);
        deptTree.setDeptName("技术部");
        deptTree.setParentId(0L);

        when(authServiceClient.getDeptTree(TEST_TENANT_ID)).thenReturn(R.ok(List.of(deptTree)));

        R<List<DeptTreeVO>> result = authServiceClient.getDeptTree(TEST_TENANT_ID);

        assertTrue(result.isSuccess());
        assertEquals(1, result.getData().size());
        assertEquals(TEST_DEPT_ID, result.getData().get(0).getDeptId());
        verify(authServiceClient, times(1)).getDeptTree(TEST_TENANT_ID);
    }

    @Test
    @DisplayName("根据ID获取部门成功")
    void testGetDeptByIdSuccess() {
        DeptVO deptVO = new DeptVO();
        deptVO.setDeptId(TEST_DEPT_ID);
        deptVO.setDeptName("技术部");
        deptVO.setLeader("张三");

        when(authServiceClient.getDeptById(TEST_DEPT_ID)).thenReturn(R.ok(deptVO));

        R<DeptVO> result = authServiceClient.getDeptById(TEST_DEPT_ID);

        assertTrue(result.isSuccess());
        assertEquals(TEST_DEPT_ID, result.getData().getDeptId());
        assertEquals("技术部", result.getData().getDeptName());
        verify(authServiceClient, times(1)).getDeptById(TEST_DEPT_ID);
    }

    @Test
    @DisplayName("根据ID获取岗位成功")
    void testGetPostByIdSuccess() {
        PostVO postVO = new PostVO();
        postVO.setPostId(TEST_POST_ID);
        postVO.setPostCode("DEV");
        postVO.setPostName("开发工程师");

        when(authServiceClient.getPostById(TEST_POST_ID)).thenReturn(R.ok(postVO));

        R<PostVO> result = authServiceClient.getPostById(TEST_POST_ID);

        assertTrue(result.isSuccess());
        assertEquals(TEST_POST_ID, result.getData().getPostId());
        assertEquals("开发工程师", result.getData().getPostName());
        verify(authServiceClient, times(1)).getPostById(TEST_POST_ID);
    }

    @Test
    @DisplayName("创建用户成功")
    void testCreateUserSuccess() {
        UserCreateDTO createDTO = new UserCreateDTO();
        createDTO.setUserName("zhangsan");
        createDTO.setNickName("张三");
        createDTO.setDeptId(TEST_DEPT_ID);

        when(authServiceClient.createUser(createDTO)).thenReturn(R.ok(TEST_USER_ID));

        R<Long> result = authServiceClient.createUser(createDTO);

        assertTrue(result.isSuccess());
        assertEquals(TEST_USER_ID, result.getData());
        verify(authServiceClient, times(1)).createUser(createDTO);
    }

    @Test
    @DisplayName("创建部门降级返回失败")
    void testCreateDeptFallback() {
        DeptCreateDTO dto = new DeptCreateDTO();
        dto.setDeptName("测试部门");

        R<Long> result = authServiceFallback.createDept(dto);

        assertFalse(result.isSuccess());
        assertTrue(result.getMsg().contains("Auth"));
    }

    @Test
    @DisplayName("禁用用户降级返回失败")
    void testDisableUserFallback() {
        R<Void> result = authServiceFallback.disableUser(TEST_USER_ID);

        assertFalse(result.isSuccess());
        assertTrue(result.getMsg().contains("Auth"));
        assertTrue(result.getMsg().contains("稍后重试"));
    }
}
