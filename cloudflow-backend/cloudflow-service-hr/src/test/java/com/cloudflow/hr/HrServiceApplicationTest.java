package com.cloudflow.hr;

import com.cloudflow.common.core.utils.RedisCache;
import com.cloudflow.hr.client.AuthServiceClient;
import com.cloudflow.hr.client.WorkflowServiceClient;
import com.cloudflow.hr.service.DeptPostSyncService;
import org.junit.jupiter.api.Test;
import org.redisson.api.RedissonClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ActiveProfiles;

/**
 * HR服务应用启动测试
 * 
 * @author CloudFlow
 * @since 1.0.0
 */
@SpringBootTest
@ActiveProfiles("test")
class HrServiceApplicationTest {

    @MockBean
    private RedisCache redisCache;

    @MockBean
    private RedissonClient redissonClient;

    @MockBean(name = "com.cloudflow.hr.client.AuthServiceClient")
    private AuthServiceClient authServiceClient;

    @MockBean(name = "com.cloudflow.hr.client.WorkflowServiceClient")
    private WorkflowServiceClient workflowServiceClient;

    @MockBean
    private DeptPostSyncService deptPostSyncService;

    /**
     * 测试应用上下文加载
     */
    @Test
    void contextLoads() {
        // 如果应用上下文成功加载，此测试将通过
    }
}
