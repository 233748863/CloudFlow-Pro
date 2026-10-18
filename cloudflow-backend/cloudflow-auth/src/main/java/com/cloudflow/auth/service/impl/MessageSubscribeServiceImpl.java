package com.cloudflow.auth.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.auth.domain.SysMessageSubscribe;
import com.cloudflow.auth.domain.dto.SubscribeDTO;
import com.cloudflow.auth.domain.vo.SubscribeVO;
import com.cloudflow.auth.mapper.SysMessageSubscribeMapper;
import com.cloudflow.auth.service.MessageSubscribeService;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ServiceException;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * 用户消息订阅服务。
 */
@Service
@RequiredArgsConstructor
public class MessageSubscribeServiceImpl implements MessageSubscribeService {
    private static final List<String> DEFAULT_CATEGORIES = List.of("TODO", "CC", "ANNOUNCEMENT", "SYSTEM", "BIZ_REMINDER");
    private static final List<String> DEFAULT_CHANNELS = List.of("INTERNAL", "EMAIL", "SMS");
    private final SysMessageSubscribeMapper mapper;

    @Override
    public List<SubscribeVO> mine() {
        Long userId = userId();
        List<SysMessageSubscribe> rows = mapper.selectList(new LambdaQueryWrapper<SysMessageSubscribe>()
                .eq(SysMessageSubscribe::getTenantId, tenantId()).eq(SysMessageSubscribe::getUserId, userId));
        java.util.Map<String, SysMessageSubscribe> existing = new java.util.HashMap<>();
        rows.forEach(row -> existing.put(row.getMessageCategory() + ":" + row.getChannelType(), row));
        List<SubscribeVO> result = new ArrayList<>();
        for (String category : DEFAULT_CATEGORIES) for (String channel : DEFAULT_CHANNELS) {
            SysMessageSubscribe row = existing.get(category + ":" + channel);
            SubscribeVO vo = new SubscribeVO();
            vo.setMessageCategory(category); vo.setChannelType(channel);
            vo.setEnabledFlag(row == null ? 1 : row.getEnabledFlag());
            if (row != null) { vo.setQuietStart(row.getQuietStart()); vo.setQuietEnd(row.getQuietEnd()); }
            result.add(vo);
        }
        return result;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void saveMine(List<SubscribeDTO> settings) {
        if (settings == null) return;
        Long userId = userId();
        for (SubscribeDTO dto : settings) {
            if (dto == null || !StringUtils.hasText(dto.getMessageCategory()) || !StringUtils.hasText(dto.getChannelType())) {
                throw new ServiceException("消息分类和渠道类型不能为空");
            }
            String category = dto.getMessageCategory().trim().toUpperCase(Locale.ROOT);
            String channel = dto.getChannelType().trim().toUpperCase(Locale.ROOT);
            if (!DEFAULT_CATEGORIES.contains(category) || !DEFAULT_CHANNELS.contains(channel)) {
                throw new ServiceException("消息分类或渠道类型不受支持");
            }
            if (dto.getEnabledFlag() != null && dto.getEnabledFlag() != 0 && dto.getEnabledFlag() != 1) {
                throw new ServiceException("订阅开关值不合法");
            }
            if ((dto.getQuietStart() == null) != (dto.getQuietEnd() == null)) {
                throw new ServiceException("免打扰开始和结束时间必须同时填写");
            }
            LambdaQueryWrapper<SysMessageSubscribe> wrapper = new LambdaQueryWrapper<SysMessageSubscribe>()
                    .eq(SysMessageSubscribe::getTenantId, tenantId()).eq(SysMessageSubscribe::getUserId, userId)
                    .eq(SysMessageSubscribe::getMessageCategory, category)
                    .eq(SysMessageSubscribe::getChannelType, channel);
            SysMessageSubscribe row = mapper.selectOne(wrapper);
            if (row == null) {
                row = new SysMessageSubscribe(); row.setTenantId(tenantId()); row.setUserId(userId());
                row.setMessageCategory(category); row.setChannelType(channel);
                row.setCreateTime(LocalDateTime.now()); row.setCreateBy(userName());
            }
            row.setEnabledFlag(dto.getEnabledFlag() == null ? 1 : dto.getEnabledFlag());
            row.setQuietStart(dto.getQuietStart()); row.setQuietEnd(dto.getQuietEnd());
            row.setUpdateTime(LocalDateTime.now()); row.setUpdateBy(userName());
            if (row.getSubscribeId() == null) {
                mapper.insert(row);
            } else {
                mapper.update(null, new LambdaUpdateWrapper<SysMessageSubscribe>()
                        .eq(SysMessageSubscribe::getSubscribeId, row.getSubscribeId())
                        .eq(SysMessageSubscribe::getTenantId, tenantId())
                        .eq(SysMessageSubscribe::getUserId, userId)
                        .set(SysMessageSubscribe::getEnabledFlag, row.getEnabledFlag())
                        .set(SysMessageSubscribe::getQuietStart, row.getQuietStart())
                        .set(SysMessageSubscribe::getQuietEnd, row.getQuietEnd())
                        .set(SysMessageSubscribe::getUpdateTime, row.getUpdateTime())
                        .set(SysMessageSubscribe::getUpdateBy, row.getUpdateBy()));
            }
        }
    }

    private Long tenantId() { return UserContext.getTenantId() == null ? 100000L : UserContext.getTenantId(); }
    private Long userId() {
        if (UserContext.getUserId() == null) throw new ServiceException("登录用户不存在", 401);
        return UserContext.getUserId();
    }
    private String userName() { return StringUtils.hasText(UserContext.getUserName()) ? UserContext.getUserName() : "system"; }
}
