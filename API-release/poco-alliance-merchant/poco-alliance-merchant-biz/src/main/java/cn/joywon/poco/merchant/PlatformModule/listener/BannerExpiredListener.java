package cn.joywon.poco.merchant.PlatformModule.listener;

import cn.joywon.poco.merchant.PlatformModule.definition.BannerCacheKey;
import cn.joywon.poco.merchant.PlatformModule.service.IMiniBannerService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.jetbrains.annotations.NotNull;
import org.springframework.data.redis.connection.Message;
import org.springframework.data.redis.connection.MessageListener;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class BannerExpiredListener implements MessageListener, BannerCacheKey {

    private final IMiniBannerService bannerService;

    @Override
    public void onMessage(@NotNull Message message, byte[] pattern) {
        String body = new String(message.getBody());

        try {
            if (body.startsWith(KEY_PREFIX_MINI_BANNER)) {
                String bannerId = body.substring(KEY_PREFIX_MINI_BANNER.length());
                bannerService.expireBanner(bannerId);
            }
        } catch (Exception e) {
            log.error("轮播图过期消息处理失败, 消息: {}", body, e);
        }

    }
}