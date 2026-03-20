package com.cloudflow.hr.exception;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.*;

/**
 * HR异常类测试
 */
class HrExceptionTest {

    @Test
    void testBusinessException() {
        // 测试假期额度不足异常
        HrBusinessException ex1 = HrBusinessException.insufficientQuota("年假", 
                new BigDecimal("3.0"), new BigDecimal("5.0"));
        assertEquals("INSUFFICIENT_QUOTA", ex1.getCode());
        assertTrue(ex1.getMessage().contains("年假"));
        assertNotNull(ex1.getData());
        
        // 测试工号重复异常
        HrBusinessException ex2 = HrBusinessException.duplicateEmployeeNo("EMP001");
        assertEquals("DUPLICATE_EMPLOYEE_NO", ex2.getCode());
        assertTrue(ex2.getMessage().contains("EMP001"));
    }

    @Test
    void testSystemException() {
        // 测试Auth服务调用失败
        HrSystemException ex1 = HrSystemException.authServiceFailed("/api/auth/dept/tree", "连接超时");
        assertEquals("SERVICE_CALL_FAILED", ex1.getCode());
        assertTrue(ex1.getMessage().contains("Auth"));
        assertNotNull(ex1.getData());
        
        // 测试数据同步失败
        HrSystemException ex2 = HrSystemException.deptSyncFailed(1L, "Auth服务返回空数据");
        assertEquals("DATA_SYNC_FAILED", ex2.getCode());
        assertTrue(ex2.getMessage().contains("部门"));
    }
}
