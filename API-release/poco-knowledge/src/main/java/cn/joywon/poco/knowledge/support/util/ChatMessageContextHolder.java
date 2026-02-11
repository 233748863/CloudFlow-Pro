package cn.joywon.poco.knowledge.support.util;

import com.alibaba.ttl.TransmittableThreadLocal;
import cn.joywon.poco.knowledge.dto.ChatMessageDTO;
import lombok.experimental.UtilityClass;

/**
 * 消息键上下文传递
 *
 * @author poco
 * @date 2024/09/26
 */
@UtilityClass
public class ChatMessageContextHolder {

	private final ThreadLocal<ChatMessageDTO> THREAD_LOCAL_TENANT = new TransmittableThreadLocal<>();

	/**
	 * 设置消息key
	 * @param messageKey 消息键
	 */
	public void set(ChatMessageDTO chatMessageDTO) {
		THREAD_LOCAL_TENANT.set(chatMessageDTO);
	}

	/**
	 * 获取消息密钥
	 * @return {@link Long }
	 */
	public ChatMessageDTO get() {
		return THREAD_LOCAL_TENANT.get();
	}

	/**
	 * 清空
	 */
	public void clear() {
		THREAD_LOCAL_TENANT.remove();
	}

}
