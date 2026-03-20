package com.cloudflow.hr;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
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

    /**
     * 测试应用上下文加载
     */
    @Test
    void contextLoads() {
        // 如果应用上下文成功加载，此测试将通过
    }
}
