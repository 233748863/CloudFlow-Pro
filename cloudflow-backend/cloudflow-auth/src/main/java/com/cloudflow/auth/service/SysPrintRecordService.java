package com.cloudflow.auth.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.auth.domain.SysPrintRecord;
import com.cloudflow.auth.mapper.SysPrintRecordMapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.exception.ServiceException;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class SysPrintRecordService {
    private final SysPrintRecordMapper mapper;

    /** 提交成功后才允许控制器交付文件，外层事务回滚也不能抹去记录。 */
    @Transactional(rollbackFor = Exception.class, propagation = Propagation.REQUIRES_NEW)
    public void save(SysPrintRecord record) {
        Long tenantId = tenant();
        if (record == null || !Objects.equals(tenantId, record.getTenantId())
                || !Objects.equals(UserContext.getUserId(), record.getOperatorId())) throw new ServiceException("打印记录身份无效", 403);
        if (mapper.insert(record) != 1) throw new ServiceException("打印记录保存失败", 503);
    }

    public PageResult<SysPrintRecord> list(String bizType, String bizId, Long operatorId, int pageNum, int pageSize) {
        LambdaQueryWrapper<SysPrintRecord> query = new LambdaQueryWrapper<SysPrintRecord>()
                .eq(SysPrintRecord::getTenantId, tenant())
                .eq(bizType != null && !bizType.isBlank(), SysPrintRecord::getBizType, bizType)
                .eq(bizId != null && !bizId.isBlank(), SysPrintRecord::getBizId, bizId)
                .eq(operatorId != null, SysPrintRecord::getOperatorId, operatorId)
                .orderByDesc(SysPrintRecord::getPrintTime).orderByDesc(SysPrintRecord::getRecordId);
        Page<SysPrintRecord> page = mapper.selectPage(new Page<>(Math.max(1, pageNum), Math.max(1, Math.min(200, pageSize))), query);
        return new PageResult<>(page.getRecords(), page.getTotal(), page.getCurrent(), page.getSize());
    }

    private Long tenant() {
        if (UserContext.getTenantId() == null || UserContext.getUserId() == null) throw new ServiceException("缺少当前用户或租户", 403);
        return UserContext.getTenantId();
    }
}
