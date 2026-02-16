package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.oa.domain.Visitor;
import com.cloudflow.oa.mapper.VisitorMapper;
import com.cloudflow.oa.service.IVisitorService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.Date;
import java.util.UUID;

/**
 * 访客管理 Service 实现类
 */
@Slf4j
@Service
public class VisitorServiceImpl extends ServiceImpl<VisitorMapper, Visitor>
        implements IVisitorService {

    @Override
    public IPage<Visitor> queryPage(Visitor query, int pageNum, int pageSize) {
        LambdaQueryWrapper<Visitor> wrapper = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(query.getVisitorName())) {
            wrapper.like(Visitor::getVisitorName, query.getVisitorName());
        }
        if (query.getHostId() != null) {
            wrapper.eq(Visitor::getHostId, query.getHostId());
        }
        if (StringUtils.hasText(query.getStatus())) {
            wrapper.eq(Visitor::getStatus, query.getStatus());
        }
        if (query.getVisitDate() != null) {
            wrapper.eq(Visitor::getVisitDate, query.getVisitDate());
        }
        wrapper.and(w -> w.isNull(Visitor::getDelFlag).or().ne(Visitor::getDelFlag, "2"));
        wrapper.orderByDesc(Visitor::getCreateTime);
        return page(new Page<>(pageNum, pageSize), wrapper);
    }

    @Override
    @Audit(name = "确认访客预约", spel = "#visitorId")
    @Transactional(rollbackFor = Exception.class)
    public boolean confirmVisitor(Long visitorId) {
        Visitor visitor = getById(visitorId);
        if (visitor == null || !"PENDING".equals(visitor.getStatus())) {
            return false;
        }
        visitor.setStatus("CONFIRMED");
        // 生成通行证编号
        visitor.setPassCode(generatePassCode());
        return updateById(visitor);
    }

    @Override
    @Audit(name = "访客签到", spel = "#visitorId")
    @Transactional(rollbackFor = Exception.class)
    public boolean checkInVisitor(Long visitorId) {
        Visitor visitor = getById(visitorId);
        if (visitor == null) {
            return false;
        }
        // 待确认或已确认状态都可以签到
        if (!"PENDING".equals(visitor.getStatus()) && !"CONFIRMED".equals(visitor.getStatus())) {
            log.warn("访客 {} 当前状态 {} 不允许签到", visitor.getVisitorName(), visitor.getStatus());
            return false;
        }
        visitor.setStatus("ARRIVED");
        visitor.setActualArrive(new Date());
        // 如果还没有通行证编号，自动生成
        if (!StringUtils.hasText(visitor.getPassCode())) {
            visitor.setPassCode(generatePassCode());
        }
        return updateById(visitor);
    }

    @Override
    @Audit(name = "访客签退", spel = "#visitorId")
    @Transactional(rollbackFor = Exception.class)
    public boolean checkOutVisitor(Long visitorId) {
        Visitor visitor = getById(visitorId);
        if (visitor == null || !"ARRIVED".equals(visitor.getStatus())) {
            return false;
        }
        visitor.setStatus("COMPLETED");
        visitor.setActualLeave(new Date());
        return updateById(visitor);
    }

    @Override
    @Audit(name = "取消访客预约", spel = "#visitorId")
    @Transactional(rollbackFor = Exception.class)
    public boolean cancelVisitor(Long visitorId) {
        Visitor visitor = getById(visitorId);
        if (visitor == null) {
            return false;
        }
        if ("ARRIVED".equals(visitor.getStatus()) || "COMPLETED".equals(visitor.getStatus())) {
            log.warn("访客 {} 当前状态 {} 不允许取消", visitor.getVisitorName(), visitor.getStatus());
            return false;
        }
        visitor.setStatus("CANCELLED");
        return updateById(visitor);
    }

    @Override
    public String generatePassCode() {
        // 生成8位通行证编号：VIS + 随机5位
        return "VIS" + UUID.randomUUID().toString().substring(0, 5).toUpperCase();
    }
}
