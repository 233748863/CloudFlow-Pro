package com.cloudflow.common.security.websocket;

import com.cloudflow.common.security.core.TokenService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.util.StringUtils;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;

import java.util.Map;

/**
 * WebSocket 握手鉴权模板（P2-3 下沉到 cloudflow-common-security）
 *
 * 适用于"URL query 携带 token"的 WebSocket 握手方案（注意：token 进入 access log / 浏览器历史，仅在内网或可信场景使用）。
 * <p>
 * 提供给子类的扩展点：
 * <ul>
 *   <li>{@link #moduleName()}：日志前缀（"OA WebSocket" / "CRM WebSocket"），便于排障</li>
 *   <li>{@link #onAuthenticated(ServletServerHttpRequest, ServerHttpResponse, Map, Long, Map)}：
 *       鉴权通过后子类可附加业务校验（如订阅权限码、租户绑定、是否 HR 员工档案在职等），返回 false 拦截</li>
 * </ul>
 *
 * 模板已统一处理：
 * <ol>
 *   <li>非 Servlet 请求拒绝（适配 Spring WebFlux 反应式栈下会失效，但当前所有 OA/Workflow 均为 Servlet 栈）</li>
 *   <li>禁止前端伪造 userId 参数（统一以 Token 解析结果为准）</li>
 *   <li>token 缺失/无效/过期 → 401</li>
 *   <li>从 loginUser 取出 userId 注入 attributes["userId"]，供后续 WebSocket Handler 读取</li>
 * </ol>
 *
 * Workflow 模块 {@code AuthHandshakeInterceptor} 采用首帧 AUTH 消息鉴权（P3-6 改造），是更安全的方案，不继承本模板。
 *
 * @author CloudFlow
 */
public abstract class AbstractTokenHandshakeInterceptor implements HandshakeInterceptor {

    protected final Logger log = LoggerFactory.getLogger(getClass());

    protected final TokenService tokenService;

    protected AbstractTokenHandshakeInterceptor(TokenService tokenService) {
        this.tokenService = tokenService;
    }

    /**
     * 日志/异常文案前缀，例如 "OA WebSocket"、"CRM Notification WebSocket"。
     */
    protected abstract String moduleName();

    /**
     * 鉴权通过后的扩展回调（默认实现：放行）。
     * <p>
     * 子类可在此追加业务校验（订阅权限、租户绑定、员工档案状态等）。
     * 返回 false 时本模板会自动设置 HTTP 401 并终止握手；
     * 若子类需要返回其他状态码，请在返回前自行 setStatusCode，并在日志或异常中表达拒绝原因。
     *
     * @param servletRequest Servlet 请求
     * @param response       HTTP 响应
     * @param attributes     WebSocket 会话属性（userId 已注入）
     * @param userId         鉴权通过的用户 ID
     * @param loginUser      Token 解析得到的完整登录用户上下文
     * @return true 允许握手；false 拒绝（模板自动写 401）
     */
    protected boolean onAuthenticated(ServletServerHttpRequest servletRequest,
                                      ServerHttpResponse response,
                                      Map<String, Object> attributes,
                                      Long userId,
                                      Map<String, Object> loginUser) {
        return true;
    }

    @Override
    public final boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response,
                                         WebSocketHandler wsHandler, Map<String, Object> attributes) {
        if (!(request instanceof ServletServerHttpRequest servletRequest)) {
            response.setStatusCode(HttpStatus.BAD_REQUEST);
            return false;
        }

        String forgedUserId = servletRequest.getServletRequest().getParameter("userId");
        if (StringUtils.hasText(forgedUserId)) {
            log.warn("{} 握手失败: 禁止携带 userId 参数", moduleName());
            response.setStatusCode(HttpStatus.UNAUTHORIZED);
            return false;
        }

        String token = servletRequest.getServletRequest().getParameter("token");
        if (!StringUtils.hasText(token)) {
            log.warn("{} 握手失败: 缺少 token 参数", moduleName());
            response.setStatusCode(HttpStatus.UNAUTHORIZED);
            return false;
        }

        Map<String, Object> loginUser = tokenService.verifyToken(token);
        if (loginUser == null) {
            log.warn("{} 握手失败: token 无效或已过期", moduleName());
            response.setStatusCode(HttpStatus.UNAUTHORIZED);
            return false;
        }

        Long userId = toLong(loginUser.get("userId"));
        if (userId == null) {
            log.warn("{} 握手失败: token 中缺少有效 userId", moduleName());
            response.setStatusCode(HttpStatus.UNAUTHORIZED);
            return false;
        }

        attributes.put("userId", userId);

        if (!onAuthenticated(servletRequest, response, attributes, userId, loginUser)) {
            response.setStatusCode(HttpStatus.UNAUTHORIZED);
            return false;
        }

        return true;
    }

    @Override
    public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response,
                               WebSocketHandler wsHandler, Exception exception) {
        if (exception != null) {
            log.warn("{} 握手后异常: {}", moduleName(), exception.getMessage());
        }
    }

    private static Long toLong(Object value) {
        if (value instanceof Long longValue) {
            return longValue;
        }
        if (value instanceof Number number) {
            return number.longValue();
        }
        if (value == null) {
            return null;
        }
        try {
            return Long.parseLong(String.valueOf(value));
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
