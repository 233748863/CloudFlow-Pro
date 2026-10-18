package com.cloudflow.hr.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.redis.core.SysConfigHelper;
import com.cloudflow.hr.domain.dto.attendance.HrAttendanceCommonQueryDTO;
import com.cloudflow.hr.domain.vo.attendance.HrAttendanceRecordVO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrAttendanceRecordMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
public class HrAttendanceRecordQueryService {
    private static final int MAX_PAGE_SIZE = 500;
    private final HrAttendanceRecordMapper mapper;
    private final SysConfigHelper configuration;

    public List<HrAttendanceRecordVO> list(HrAttendanceCommonQueryDTO query) {
        validateRange(query);
        return mapper.selectAccessibleList(HrRuleSupport.tenantId(), query, readScope());
    }

    public PageResult<HrAttendanceRecordVO> page(HrAttendanceCommonQueryDTO query) {
        validateRange(query);
        int pageNumber = Math.max(1, query.getPageNum() == null ? 1 : query.getPageNum());
        int maximumSize = Math.max(1, Math.min(MAX_PAGE_SIZE, configuration.getConfigInt("sys.hr.maxPageSize", MAX_PAGE_SIZE)));
        int pageSize = Math.min(maximumSize, Math.max(1, query.getPageSize() == null ? 20 : query.getPageSize()));
        Page<HrAttendanceRecordVO> result = new Page<>(pageNumber, pageSize);
        mapper.selectAccessiblePage(result, HrRuleSupport.tenantId(), query, readScope());
        return PageResult.build(result);
    }

    private HrEmployeeReadScope readScope() {
        Integer scopeType = UserContext.getDsType();
        if (scopeType == null || scopeType == 0) return new HrEmployeeReadScope(true, null, List.of(), null);
        if (scopeType == 1 || scopeType == 2) {
            return new HrEmployeeReadScope(false, null, UserContext.getDsDeptIds(), null);
        }
        if (scopeType == 3) {
            Long departmentId = UserContext.getDeptId();
            return new HrEmployeeReadScope(false, null, departmentId == null ? List.of() : List.of(departmentId), null);
        }
        if (scopeType == 4) return new HrEmployeeReadScope(false, UserContext.getUserId(), List.of(), null);
        return new HrEmployeeReadScope(false, null, List.of(), null);
    }

    private void validateRange(HrAttendanceCommonQueryDTO query) {
        if (query.getStartDate() != null && query.getEndDate() != null && query.getStartDate().isAfter(query.getEndDate())) {
            throw new HrBusinessException("INVALID_DATE_RANGE", "开始日期不能晚于结束日期");
        }
    }
}
