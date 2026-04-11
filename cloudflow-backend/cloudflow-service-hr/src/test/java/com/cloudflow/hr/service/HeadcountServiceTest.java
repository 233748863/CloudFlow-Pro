package com.cloudflow.hr.service;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.hr.client.AuthServiceClient;
import com.cloudflow.hr.domain.dto.HeadcountSetDTO;
import com.cloudflow.hr.domain.entity.Headcount;
import com.cloudflow.hr.domain.vo.HeadcountStatisticsVO;
import com.cloudflow.hr.exception.HrSystemException;
import com.cloudflow.hr.mapper.HeadcountMapper;
import com.cloudflow.hr.service.impl.HeadcountServiceImpl;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class HeadcountServiceTest {

    @Mock
    private HeadcountMapper headcountMapper;

    @Mock
    private AuthServiceClient authServiceClient;

    @Mock
    private DeptPostSyncService deptPostSyncService;

    @InjectMocks
    private HeadcountServiceImpl headcountService;

    @BeforeEach
    void setUpUserContext() {
        UserContext.setUserId(1001L);
        UserContext.setUserName("tester");
        UserContext.setTenantId(2001L);
    }

    @AfterEach
    void clearUserContext() {
        UserContext.clear();
    }

    @Test
    void testSetHeadcountRejectsWhenDeptServiceReturnsNullResponse() {
        HeadcountSetDTO dto = new HeadcountSetDTO();
        dto.setTargetType("DEPT");
        dto.setTargetId(101L);
        dto.setApprovedCount(5);
        dto.setEffectiveDate(LocalDate.of(2026, 4, 11));

        when(authServiceClient.getDeptById(101L)).thenReturn(null);

        HrSystemException exception = assertThrows(HrSystemException.class, () -> headcountService.setHeadcount(dto));

        assertEquals("校验部门编制目标失败：Auth 服务无响应", exception.getMessage());
    }

    @Test
    void testGetHeadcountStatisticsFallsBackToUnknownDeptWhenAuthReturnsNull() {
        Headcount headcount = new Headcount();
        headcount.setTenantId(2001L);
        headcount.setTargetType("DEPT");
        headcount.setTargetId(101L);
        headcount.setApprovedCount(10);
        headcount.setActualCount(6);
        headcount.setVacancyCount(4);

        when(headcountMapper.selectOne(any())).thenReturn(headcount);
        when(deptPostSyncService.getCachedDept(101L)).thenReturn(null);
        when(authServiceClient.getDeptById(101L)).thenReturn(null);

        HeadcountStatisticsVO statistics = headcountService.getHeadcountStatistics("DEPT", 101L);

        assertEquals("未知部门", statistics.getTargetName());
        assertEquals(10, statistics.getApprovedCount());
        assertEquals(6, statistics.getActualCount());
    }
}
