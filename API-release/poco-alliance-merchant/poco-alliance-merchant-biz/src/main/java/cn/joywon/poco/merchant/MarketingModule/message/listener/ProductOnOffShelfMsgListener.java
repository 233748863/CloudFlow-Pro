package cn.joywon.poco.merchant.MarketingModule.message.listener;

import cn.hutool.core.lang.Assert;
import cn.joywon.poco.common.core.exception.CheckedException;
import cn.joywon.poco.merchant.MarketingModule.definition.PointsMallCacheKey;
import cn.joywon.poco.merchant.MarketingModule.service.IPointsMallProductService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.jetbrains.annotations.NotNull;
import org.springframework.data.redis.connection.Message;
import org.springframework.data.redis.connection.MessageListener;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class ProductOnOffShelfMsgListener implements MessageListener, PointsMallCacheKey {

    private final IPointsMallProductService pointsMallProductService;

    @Override
    public void onMessage(@NotNull Message message, byte[] pattern) {
        String body = new String(message.getBody());
        String productId = null;
        Boolean onShelf = null;
        boolean result = false;
        try {
            if (body.startsWith(KEY_PREFIX_PRODUCT_ON_SHELF)) {
                // 上架消息
                productId = body.substring(KEY_PREFIX_PRODUCT_ON_SHELF.length());
                onShelf = Boolean.TRUE;
            } else if (body.startsWith(KEY_PREFIX_PRODUCT_OFF_SHELF)) {
                // 下架消息
                productId = body.substring(KEY_PREFIX_PRODUCT_OFF_SHELF.length());
                onShelf = Boolean.FALSE;
            }
            Assert.notBlank(productId, () -> {
                log.error("处理积分商品上/下架消息失败, 无效的商品ID, 消息体: {}", body);
                throw new CheckedException("处理积分商品上/下架消息失败, 无效的商品ID");
            });
            // 调用业务处理
            pointsMallProductService.onOffShelfByMessage(productId, Boolean.TRUE.equals(onShelf));

        } catch (CheckedException checkedEx) {
            // 捕获检查异常, 不进行重试
            log.error("处理积分商品上/下架消息失败", checkedEx);
            throw checkedEx;

        } catch (Exception ex) {
            // 捕获非检查异常, 进行重试
            log.error("处理积分商品上/下架消息失败, 进入 [重试], 商品ID: {}", productId, ex);
            int reTryCount = 5;
            long sleepMs = 1000L;
            while (reTryCount > 0) {
                try {
                    log.warn("积分商品上/下消息处理 [重试] 失败, 剩余 {} 次重试, 商品ID: {}", reTryCount, productId);
                    result = pointsMallProductService.onOffShelfByMessage(productId, Boolean.TRUE.equals(onShelf));
                    if (result) {
                        break;
                    }
                    Thread.sleep(sleepMs);
                } catch (Exception e) {
                    log.warn("积分商品上/下消息处理 [重试] 失败, 剩余 {} 次重试, 商品ID: {}", reTryCount, productId, e);
                }

                sleepMs += sleepMs;
                reTryCount--;
            }
        }

        if (result) {
            log.info("积分商品上/下架消息处理成功, 商品ID: {}", productId);
        } else {
            log.warn("积分商品上/下架消息处理失败, 商品ID: {}", productId);
        }
    }

}