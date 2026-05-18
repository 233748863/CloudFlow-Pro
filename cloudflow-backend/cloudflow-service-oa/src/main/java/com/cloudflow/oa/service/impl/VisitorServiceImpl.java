package com.cloudflow.oa.service.impl;

import cn.hutool.extra.qrcode.QrCodeUtil;
import cn.hutool.extra.qrcode.QrConfig;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.oa.domain.Visitor;
import com.cloudflow.oa.mapper.VisitorMapper;
import com.cloudflow.oa.service.IVisitorService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.io.OutputStream;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * 访客管理 Service 实现类
 */
@Slf4j
@Service
public class VisitorServiceImpl extends ServiceImpl<VisitorMapper, Visitor>
        implements IVisitorService {

    private static final ObjectMapper QR_OBJECT_MAPPER = new ObjectMapper();

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
        wrapper.and(w -> w.isNull(Visitor::getDeleted).or().ne(Visitor::getDeleted, "2"));
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
        if (!"CONFIRMED".equals(visitor.getStatus())) {
            log.warn("访客 {} 当前状态 {} 不允许签到", visitor.getVisitorName(), visitor.getStatus());
            return false;
        }
        visitor.setStatus("ARRIVED");
        visitor.setActualArrive(LocalDateTime.now());
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
        visitor.setActualLeave(LocalDateTime.now());
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

    @Override
    public void generateQrCode(Long visitorId, OutputStream outputStream) {
        Visitor visitor = getById(visitorId);
        if (visitor == null) {
            throw new ServiceException("访客记录不存在");
        }
        if (!StringUtils.hasText(visitor.getPassCode())) {
            throw new ServiceException("通行码不存在，请先确认预约");
        }

        Map<String, Object> content = new LinkedHashMap<>();
        content.put("type", "VISITOR_PASS");
        content.put("visitorId", visitor.getVisitorId());
        content.put("passCode", visitor.getPassCode());
        content.put("visitorName", visitor.getVisitorName());
        content.put("visitorCompany", visitor.getVisitorCompany());
        content.put("hostName", visitor.getHostName());
        content.put("visitDate", visitor.getVisitDate() == null ? null : visitor.getVisitDate().toString());

        QrConfig config = new QrConfig(300, 300);
        config.setMargin(2);
        config.setErrorCorrection(ErrorCorrectionLevel.M);
        QrCodeUtil.generate(toQrContent(content), config, "png", outputStream);
    }

    private String toQrContent(Map<String, Object> content) {
        try {
            return QR_OBJECT_MAPPER.writeValueAsString(content);
        } catch (JsonProcessingException e) {
            throw new ServiceException("访客通行二维码内容生成失败");
        }
    }
}
