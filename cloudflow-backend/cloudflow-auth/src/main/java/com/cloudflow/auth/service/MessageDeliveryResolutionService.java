package com.cloudflow.auth.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.auth.domain.dto.MessageDeliveryResolveDTO;
import com.cloudflow.auth.domain.vo.MessageDeliveryVO;
import com.cloudflow.auth.mapper.SysUserMapper;
import com.cloudflow.auth.message.MessageDeliveryService;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.audit.annotation.HighRiskAction;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ServiceException;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class MessageDeliveryResolutionService {
    private final MessageDeliveryService deliveries;
    private final SysUserMapper users;
    private final PasswordService passwords;
    private final TotpService totp;

    public MessageDeliveryVO get(Long deliveryId) {
        MessageDeliveryVO result = new MessageDeliveryVO();
        BeanUtils.copyProperties(deliveries.getOwned(UserContext.getTenantId(), deliveryId), result);
        return result;
    }

    @HighRiskAction
    @Audit(name = "人工核验外部消息接纳结果", highRisk = true)
    public MessageDeliveryVO resolve(Long deliveryId, MessageDeliveryResolveDTO request) {
        Long tenantId = UserContext.getTenantId();
        Long userId = UserContext.getUserId();
        if (tenantId == null || userId == null) throw new ServiceException("登录上下文无效", 401);
        SysUser user = users.selectOne(new LambdaQueryWrapper<SysUser>().eq(SysUser::getTenantId, tenantId)
                .eq(SysUser::getUserId, userId).eq(SysUser::getStatus, "0").eq(SysUser::getDeleted, 0));
        if (user == null || !passwords.matchesPassword(request.getPassword(), user.getPassword()).matched()
                || totp.isEnabled(userId, tenantId) && !totp.verifyLoginCode(userId, tenantId, request.getTotpCode())) {
            throw new ServiceException("再次身份验证失败", 403);
        }
        deliveries.recordResolution(tenantId, deliveryId, userId, request.getVersion(), request.getConclusion(), request.getEvidence());
        return get(deliveryId);
    }
}
