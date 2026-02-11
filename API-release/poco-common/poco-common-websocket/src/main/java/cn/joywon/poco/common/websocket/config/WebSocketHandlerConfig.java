package cn.joywon.poco.common.websocket.config;

import cn.joywon.poco.common.websocket.custom.PocoSessionKeyGenerator;
import cn.joywon.poco.common.websocket.custom.UserAttributeHandshakeInterceptor;
import cn.joywon.poco.common.websocket.handler.CustomPlanTextMessageHandler;
import cn.joywon.poco.common.websocket.handler.CustomWebSocketHandler;
import cn.joywon.poco.common.websocket.handler.PingJsonMessageHandler;
import cn.joywon.poco.common.websocket.handler.PlanTextMessageHandler;
import cn.joywon.poco.common.websocket.holder.MapSessionWebSocketHandlerDecorator;
import cn.joywon.poco.common.websocket.holder.SessionKeyGenerator;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;

/**
 * @author Hccake 2021/1/5
 * @version 1.0
 */
@RequiredArgsConstructor
@EnableConfigurationProperties(WebSocketProperties.class)
public class WebSocketHandlerConfig {

	private final WebSocketProperties webSocketProperties;

	@Bean
	@ConditionalOnMissingBean(SessionKeyGenerator.class)
	public SessionKeyGenerator sessionKeyGenerator() {
		return new PocoSessionKeyGenerator();
	}

	@Bean
	public HandshakeInterceptor handshakeInterceptor() {
		return new UserAttributeHandshakeInterceptor();
	}

	@Bean
	@ConditionalOnMissingBean(PlanTextMessageHandler.class)
	public PlanTextMessageHandler planTextMessageHandler() {
		return new CustomPlanTextMessageHandler();
	}

	@Bean
	@ConditionalOnMissingBean({ TextWebSocketHandler.class, PlanTextMessageHandler.class })
	public WebSocketHandler webSocketHandler1(@Autowired(required = false) SessionKeyGenerator sessionKeyGenerator) {
		CustomWebSocketHandler customWebSocketHandler = new CustomWebSocketHandler();
		if (webSocketProperties.isMapSession()) {
			return new MapSessionWebSocketHandlerDecorator(customWebSocketHandler, sessionKeyGenerator, webSocketProperties);
		}
		return customWebSocketHandler;
	}

	@Bean
	@ConditionalOnBean(PlanTextMessageHandler.class)
	@ConditionalOnMissingBean(TextWebSocketHandler.class)
	public WebSocketHandler webSocketHandler2(@Autowired(required = false) SessionKeyGenerator sessionKeyGenerator,
			PlanTextMessageHandler planTextMessageHandler) {
		CustomWebSocketHandler customWebSocketHandler = new CustomWebSocketHandler(planTextMessageHandler);
		if (webSocketProperties.isMapSession()) {
			return new MapSessionWebSocketHandlerDecorator(customWebSocketHandler, sessionKeyGenerator,webSocketProperties);
		}
		return customWebSocketHandler;
	}

	@Bean
	@ConditionalOnProperty(prefix = WebSocketProperties.PREFIX, name = "heartbeat", havingValue = "true",
			matchIfMissing = true)
	public PingJsonMessageHandler pingJsonMessageHandler() {
		return new PingJsonMessageHandler();
	}

}
