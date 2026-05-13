package com.cloudflow.common.log.util;

import cn.hutool.core.map.MapUtil;
import cn.hutool.core.util.ArrayUtil;
import cn.hutool.extra.spring.SpringUtil;
import cn.hutool.http.HttpUtil;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.utils.IpUtils;
import com.cloudflow.common.log.config.CloudFlowLogProperties;
import com.cloudflow.common.sensitive.utils.SensitiveUtils;
import com.cloudflow.common.tenant.TenantConfigProperties;
import com.cloudflow.common.log.domain.SysLogEntity;
import com.cloudflow.common.log.enums.LogTypeEnum;
import jakarta.servlet.http.HttpServletRequest;
import lombok.experimental.UtilityClass;
import org.springframework.core.StandardReflectionParameterNameDiscoverer;
import org.springframework.expression.EvaluationContext;
import org.springframework.expression.Expression;
import org.springframework.expression.spel.standard.SpelExpressionParser;
import org.springframework.expression.spel.support.StandardEvaluationContext;
import org.springframework.http.HttpHeaders;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.lang.reflect.Method;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.Objects;

/**
 * 操作日志工具类
 * <p>
 * 从 HTTP 请求和 UserContext 中收集日志信息，
 * 替代 poco 原版中对 Spring Security OAuth2 的依赖。
 * </p>
 *
 * @author CloudFlow
 */
@UtilityClass
public class SysLogUtils {

    /**
     * 从当前请求上下文构建日志实体（不含 body 参数）
     *
     * @return 预填充的日志实体
     */
    public SysLogEntity buildSysLog() {
        HttpServletRequest request = ((ServletRequestAttributes) Objects
                .requireNonNull(RequestContextHolder.getRequestAttributes())).getRequest();

        SysLogEntity sysLog = new SysLogEntity();
        sysLog.setLogType(LogTypeEnum.NORMAL.getType());
        sysLog.setRequestUri(request.getRequestURI());
        sysLog.setMethod(request.getMethod());
        sysLog.setRemoteAddr(IpUtils.getIpAddr(request));
        sysLog.setUserAgent(request.getHeader(HttpHeaders.USER_AGENT));
        sysLog.setCreateTime(LocalDateTime.now());

        // 从 UserContext 获取操作人（适配 CloudFlow 的用户上下文）
        sysLog.setCreateBy(UserContext.getUserName());

        // 获取服务名称
        sysLog.setServiceId(SpringUtil.getProperty("spring.application.name"));

        // 获取租户ID，降级使用 TenantConfigProperties 中的默认值
        Long tenantId = UserContext.getTenantId();
        if (tenantId == null) {
            try {
                TenantConfigProperties tenantConfig = SpringUtil.getBean(TenantConfigProperties.class);
                tenantId = tenantConfig.getDefaultTenantId();
            } catch (Exception e) {
                tenantId = 100000L;
            }
        }
        sysLog.setTenantId(tenantId);

        // GET 参数脱敏处理
        CloudFlowLogProperties logProperties = SpringUtil.getBean(CloudFlowLogProperties.class);
        Map<String, String[]> paramsMap = SensitiveUtils.maskRequestParams(
                new HashMap<>(request.getParameterMap()),
                logProperties.getExcludeFields()
        );
        sysLog.setParams(HttpUtil.toParams(paramsMap));

        return sysLog;
    }

    /**
     * 解析 SPEL 表达式获取值
     *
     * @param context SPEL 上下文
     * @param key     表达式字符串
     * @param clazz   返回类型
     * @param <T>     泛型
     * @return 表达式计算结果
     */
    public <T> T getValue(EvaluationContext context, String key, Class<T> clazz) {
        SpelExpressionParser parser = new SpelExpressionParser();
        Expression expression = parser.parseExpression(key);
        return expression.getValue(context, clazz);
    }

    /**
     * 构建 SPEL 表达式上下文（将方法参数注入为变量）
     *
     * @param arguments       方法参数值数组
     * @param signatureMethod 被拦截的方法
     * @return SPEL 上下文
     */
    public EvaluationContext getContext(Object[] arguments, Method signatureMethod) {
        String[] parameterNames = new StandardReflectionParameterNameDiscoverer()
                .getParameterNames(signatureMethod);
        EvaluationContext context = new StandardEvaluationContext();
        if (parameterNames == null) {
            return context;
        }
        for (int i = 0; i < arguments.length; i++) {
            context.setVariable(parameterNames[i], arguments[i]);
        }
        return context;
    }
}
