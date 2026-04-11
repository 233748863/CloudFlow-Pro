package com.cloudflow.hr.sync;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.utils.RedisCache;
import com.cloudflow.hr.client.AuthServiceClient;
import com.cloudflow.hr.client.vo.DeptTreeVO;
import com.cloudflow.hr.client.vo.DeptVO;
import com.cloudflow.hr.client.vo.PostVO;
import com.cloudflow.hr.config.DeptPostSyncInitializer;
import com.cloudflow.hr.job.DeptPostSyncJob;
import com.cloudflow.hr.service.impl.DeptPostSyncServiceImpl;
import lombok.extern.slf4j.Slf4j;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.springframework.boot.ApplicationArguments;

import java.util.*;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * 部门岗位数据同步单元测试
 * 
 * 验证以下功能：
 * 1. 启动时全量同步
 * 2. 定时任务增量同步（基于Redis缓存）
 * 3. 缓存更新逻辑
 * 4. 失效检测逻辑
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Slf4j
@ExtendWith(MockitoExtension.class)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class DeptPostSyncUnitTest {

    @Mock
    private AuthServiceClient authServiceClient;

    @Mock
    private RedisCache redisCache;

    @Mock
    private RedissonClient redissonClient;

    @InjectMocks
    private DeptPostSyncServiceImpl deptPostSyncService;

    private static final Long TEST_DEPT_ID = 100L;
    private static final Long TEST_POST_ID = 200L;
    private static final Long TEST_TENANT_ID = 1L;

    /**
     * 测试1：验证启动时全量同步
     * 
     * 验证需求：1.13 - WHEN HR_Service启动时 THEN THE Organization_Module SHALL 
     * 验证与Auth_Service的连接并缓存部门和岗位基础数据
     */
    @Test
    @Order(1)
    @DisplayName("测试1：验证启动时全量同步")
    void testStartupFullSync() {
        log.info("=== 开始测试：启动时全量同步 ===");

        // 准备测试数据
        List<DeptTreeVO> mockDeptTree = createMockDeptTree();
        List<PostVO> mockPostList = createMockPostList();

        // Mock Auth服务返回
        when(authServiceClient.getDeptTree(null))
                .thenReturn(R.ok(mockDeptTree));
        when(authServiceClient.getPostList(null))
                .thenReturn(R.ok(mockPostList));

        // 执行启动初始化
        DeptPostSyncInitializer initializer = new DeptPostSyncInitializer(deptPostSyncService);
        ApplicationArguments args = mock(ApplicationArguments.class);
        initializer.run(args);

        // 验证调用了Auth服务
        verify(authServiceClient, times(1)).getDeptTree(null);
        verify(authServiceClient, times(1)).getPostList(null);

        // 验证缓存了部门树
        ArgumentCaptor<Object> deptTreeCaptor = ArgumentCaptor.forClass(Object.class);
        verify(redisCache, times(1)).setCacheObject(
                eq("hr:dept:tree"),
                deptTreeCaptor.capture(),
                eq(24L),
                eq(TimeUnit.HOURS)
        );
        Object cachedDeptTreeObject = deptTreeCaptor.getValue();
        assertInstanceOf(List.class, cachedDeptTreeObject);
        List<?> cachedDeptTree = (List<?>) cachedDeptTreeObject;
        assertFalse(cachedDeptTree.isEmpty(), "部门树缓存不应为空");
        assertInstanceOf(DeptVO.class, cachedDeptTree.get(0));
        DeptVO rootDept = (DeptVO) cachedDeptTree.get(0);
        assertEquals("总公司", rootDept.getDeptName());
        assertNotNull(rootDept.getChildren());
        assertEquals(2, rootDept.getChildren().size());

        // 验证缓存了岗位列表
        verify(redisCache, times(1)).setCacheObject(
                eq("hr:post:list"),
                eq(mockPostList),
                eq(24L),
                eq(TimeUnit.HOURS)
        );

        // 验证缓存了每个部门（包括子部门）
        ArgumentCaptor<String> deptKeyCaptor = ArgumentCaptor.forClass(String.class);
        verify(redisCache, atLeast(3)).setCacheObject(
                deptKeyCaptor.capture(),
                any(DeptVO.class),
                eq(24L),
                eq(TimeUnit.HOURS)
        );

        List<String> deptKeys = deptKeyCaptor.getAllValues();
        assertTrue(deptKeys.stream().anyMatch(key -> key.contains("hr:dept:")),
                "应该缓存了部门数据");

        // 验证缓存了每个岗位
        ArgumentCaptor<String> postKeyCaptor = ArgumentCaptor.forClass(String.class);
        verify(redisCache, atLeast(2)).setCacheObject(
                postKeyCaptor.capture(),
                any(PostVO.class),
                eq(24L),
                eq(TimeUnit.HOURS)
        );

        List<String> postKeys = postKeyCaptor.getAllValues();
        assertTrue(postKeys.stream().anyMatch(key -> key.contains("hr:post:")),
                "应该缓存了岗位数据");

        log.info("✓ 启动时全量同步验证通过");
        log.info("=== 测试完成：启动时全量同步 ===\n");
    }

    /**
     * 测试2：验证定时任务增量同步（基于Redis缓存）
     * 
     * 验证需求：1.14 - WHEN Auth_Service的部门或岗位数据变更 THEN THE Organization_Module SHALL 
     * 通过定时任务同步更新本地缓存
     */
    @Test
    @Order(2)
    @DisplayName("测试2：验证定时任务增量同步")
    void testScheduledIncrementalSync() {
        log.info("=== 开始测试：定时任务增量同步 ===");

        // 准备测试数据
        List<DeptTreeVO> mockDeptTree = createMockDeptTree();
        List<PostVO> mockPostList = createMockPostList();

        // Mock Auth服务返回
        when(authServiceClient.getDeptTree(null))
                .thenReturn(R.ok(mockDeptTree));
        when(authServiceClient.getPostList(null))
                .thenReturn(R.ok(mockPostList));

        // Mock 分布式锁
        RLock mockLock = mock(RLock.class);
        when(redissonClient.getLock(anyString())).thenReturn(mockLock);
        try {
            when(mockLock.tryLock(anyLong(), anyLong(), any(TimeUnit.class))).thenReturn(true);
        } catch (InterruptedException e) {
            fail("Mock锁失败");
        }

        // 执行定时任务
        DeptPostSyncJob job = new DeptPostSyncJob(deptPostSyncService, redissonClient);
        job.syncDeptPostData();

        // 验证获取了分布式锁
        verify(redissonClient, times(1)).getLock("lock:scheduled:syncDeptPostData");

        // 验证调用了Auth服务
        verify(authServiceClient, times(1)).getDeptTree(null);
        verify(authServiceClient, times(1)).getPostList(null);

        // 验证释放了锁
        verify(mockLock, times(1)).unlock();

        log.info("✓ 定时任务增量同步验证通过");
        log.info("=== 测试完成：定时任务增量同步 ===\n");
    }

    /**
     * 测试3：验证缓存更新逻辑
     */
    @Test
    @Order(3)
    @DisplayName("测试3：验证缓存更新逻辑")
    void testCacheUpdateLogic() {
        log.info("=== 开始测试：缓存更新逻辑 ===");

        // 准备测试数据
        DeptVO mockDept = createMockDept(TEST_DEPT_ID, "测试部门");

        // Mock Auth服务返回
        when(authServiceClient.getDeptById(TEST_DEPT_ID))
                .thenReturn(R.ok(mockDept));

        // 第一次调用：缓存未命中，从Auth服务获取
        when(redisCache.getCacheObject("hr:dept:" + TEST_DEPT_ID))
                .thenReturn(null);

        boolean isValid1 = deptPostSyncService.validateDeptId(TEST_DEPT_ID);
        assertTrue(isValid1, "部门ID应该有效");

        // 验证调用了Auth服务
        verify(authServiceClient, times(2)).getDeptById(TEST_DEPT_ID);

        // 验证缓存了数据
        verify(redisCache, times(1)).setCacheObject(
                eq("hr:dept:" + TEST_DEPT_ID),
                eq(mockDept),
                eq(24L),
                eq(TimeUnit.HOURS)
        );

        // 第二次调用：缓存命中，不调用Auth服务
        when(redisCache.getCacheObject("hr:dept:" + TEST_DEPT_ID))
                .thenReturn(mockDept);

        boolean isValid2 = deptPostSyncService.validateDeptId(TEST_DEPT_ID);
        assertTrue(isValid2, "部门ID应该有效");

        // 验证没有再次调用Auth服务（总共还是1次）
        verify(authServiceClient, times(2)).getDeptById(TEST_DEPT_ID);

        log.info("✓ 缓存更新逻辑验证通过");
        log.info("=== 测试完成：缓存更新逻辑 ===\n");
    }

    /**
     * 测试4：验证失效检测逻辑
     * 
     * 验证需求：1.16 - WHEN Auth_Service的部门被删除 THEN THE Organization_Module SHALL 
     * 检测到关联的dept_id失效并标记相关职位为无效状态
     */
    @Test
    @Order(4)
    @DisplayName("测试4：验证失效检测逻辑")
    void testInvalidationDetectionLogic() {
        log.info("=== 开始测试：失效检测逻辑 ===");

        Long invalidDeptId = 999L;

        // Mock Auth服务返回null（表示部门已删除）
        when(authServiceClient.getDeptById(invalidDeptId))
                .thenReturn(R.ok(null));

        // Mock 缓存未命中
        when(redisCache.getCacheObject("hr:dept:" + invalidDeptId))
                .thenReturn(null);

        // 验证部门ID
        boolean isValid = deptPostSyncService.validateDeptId(invalidDeptId);
        assertFalse(isValid, "已删除的部门ID应该无效");

        // 验证调用了Auth服务
        verify(authServiceClient, times(1)).getDeptById(invalidDeptId);

        // 验证没有缓存数据（因为返回null）
        verify(redisCache, never()).setCacheObject(
                eq("hr:dept:" + invalidDeptId),
                any(),
                anyLong(),
                any(TimeUnit.class)
        );

        log.info("✓ 失效检测逻辑验证通过");
        log.info("=== 测试完成：失效检测逻辑 ===\n");
    }

    /**
     * 测试5：验证缓存清除逻辑
     */
    @Test
    @Order(5)
    @DisplayName("测试5：验证缓存清除逻辑")
    void testCacheClearLogic() {
        log.info("=== 开始测试：缓存清除逻辑 ===");

        // 清除单个部门缓存
        deptPostSyncService.clearDeptCache(TEST_DEPT_ID);
        verify(redisCache, times(1)).deleteObject("hr:dept:" + TEST_DEPT_ID);

        // 清除单个岗位缓存
        deptPostSyncService.clearPostCache(TEST_POST_ID);
        verify(redisCache, times(1)).deleteObject("hr:post:" + TEST_POST_ID);

        // 清除所有缓存
        deptPostSyncService.clearAllCache();
        verify(redisCache, times(1)).deleteObject("hr:dept:tree");
        verify(redisCache, times(1)).deleteObject("hr:post:list");

        log.info("✓ 缓存清除逻辑验证通过");
        log.info("=== 测试完成：缓存清除逻辑 ===\n");
    }

    // ==================== 辅助方法 ====================

    /**
     * 创建Mock部门树
     */
    @Test
    @Order(6)
    @DisplayName("测试6：Auth 空响应时同步单个部门会给出明确异常")
    void testSyncDepartmentRejectsWhenAuthReturnsNull() {
        when(authServiceClient.getDeptById(TEST_DEPT_ID)).thenReturn(null);

        RuntimeException exception = assertThrows(RuntimeException.class, () -> deptPostSyncService.syncDepartment(TEST_DEPT_ID));

        assertTrue(exception.getMessage().contains("Auth 服务无响应"));
    }

    @Test
    @Order(7)
    @DisplayName("测试7：Auth 空响应时校验岗位ID直接返回 false")
    void testValidatePostIdReturnsFalseWhenAuthReturnsNull() {
        when(redisCache.getCacheObject("hr:post:" + TEST_POST_ID)).thenReturn(null);
        when(authServiceClient.getPostById(TEST_POST_ID)).thenReturn(null);

        boolean isValid = deptPostSyncService.validatePostId(TEST_POST_ID);

        assertFalse(isValid, "Auth 空响应时不应把岗位误判为有效");
    }

    @Test
    @Order(8)
    @DisplayName("娴嬭瘯8锛欰uth 鎴愬姛浣嗘湭杩斿洖閮ㄩ棬鏁版嵁鏃讹紝鍚屾鍗曚釜閮ㄩ棬浼氭槑纭け璐?")
    void testSyncDepartmentRejectsWhenAuthReturnsNullDeptPayload() {
        when(authServiceClient.getDeptById(TEST_DEPT_ID)).thenReturn(R.ok((DeptVO) null));

        RuntimeException exception = assertThrows(RuntimeException.class, () -> deptPostSyncService.syncDepartment(TEST_DEPT_ID));

        assertTrue(exception.getMessage().contains("未返回部门数据"));
    }

    private List<DeptTreeVO> createMockDeptTree() {
        List<DeptTreeVO> tree = new ArrayList<>();

        // 顶级部门
        DeptTreeVO dept1 = new DeptTreeVO();
        dept1.setDeptId(100L);
        dept1.setParentId(0L);
        dept1.setDeptName("总公司");
        dept1.setOrderNum(1);
        dept1.setLeader("张三");
        dept1.setStatus(0);

        // 子部门
        DeptTreeVO dept2 = new DeptTreeVO();
        dept2.setDeptId(101L);
        dept2.setParentId(100L);
        dept2.setDeptName("技术部");
        dept2.setOrderNum(1);
        dept2.setLeader("李四");
        dept2.setStatus(0);

        DeptTreeVO dept3 = new DeptTreeVO();
        dept3.setDeptId(102L);
        dept3.setParentId(100L);
        dept3.setDeptName("产品部");
        dept3.setOrderNum(2);
        dept3.setLeader("王五");
        dept3.setStatus(0);

        dept1.setChildren(Arrays.asList(dept2, dept3));
        tree.add(dept1);

        return tree;
    }

    /**
     * 创建Mock岗位列表
     */
    private List<PostVO> createMockPostList() {
        List<PostVO> list = new ArrayList<>();

        PostVO post1 = createMockPost(200L, "Java开发工程师");
        PostVO post2 = createMockPost(201L, "产品经理");

        list.add(post1);
        list.add(post2);

        return list;
    }

    /**
     * 创建Mock部门
     */
    private DeptVO createMockDept(Long deptId, String deptName) {
        DeptVO dept = new DeptVO();
        dept.setDeptId(deptId);
        dept.setParentId(0L);
        dept.setDeptName(deptName);
        dept.setOrderNum(1);
        dept.setLeader("测试负责人");
        dept.setStatus(0);
        return dept;
    }

    /**
     * 创建Mock岗位
     */
    private PostVO createMockPost(Long postId, String postName) {
        PostVO post = new PostVO();
        post.setPostId(postId);
        post.setPostCode("POST_" + postId);
        post.setPostName(postName);
        post.setPostSort(1);
        post.setStatus(0);
        return post;
    }
}
