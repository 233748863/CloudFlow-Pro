package cn.joywon.poco.merchant.MarketingModule.repository.impl;

import cn.hutool.core.lang.Assert;
import cn.joywon.poco.merchant.MarketingModule.definition.PointsMallCacheKey;
import cn.joywon.poco.merchant.MarketingModule.dto.PointsMallProductOnOffShelfDTO;
import cn.joywon.poco.merchant.MarketingModule.repository.IPointsMallProductCacheRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Repository;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.concurrent.TimeUnit;

@Slf4j
@Repository
@RequiredArgsConstructor
public class PointsMallProductCacheRepositoryImpl implements IPointsMallProductCacheRepository, PointsMallCacheKey {

    private final RedisTemplate<String, Object> redisTemplate;


    /**
     * 定时上架/下架积分商品
     *
     * @param dto 积分商品上架/下架参数
     */
    @Override
    public boolean pendingOnOrOffShelf(PointsMallProductOnOffShelfDTO dto) {
        Boolean result = null;
        String id = dto.getId();
        String onOrOff = dto.getOnShelf() ? "上架" : "下架";
        long expireSeconds = Duration.between(LocalDateTime.now(), dto.getOnOffShelfTime()).getSeconds();
        String key = (dto.getOnShelf() ? KEY_PREFIX_PRODUCT_ON_SHELF : KEY_PREFIX_PRODUCT_OFF_SHELF) + dto.getId();

        try {
            result = redisTemplate.opsForValue().setIfAbsent(key, id, expireSeconds, TimeUnit.SECONDS);
            Assert.isTrue(result != null && result, () -> {
                log.error("积分商品定时 {} 缓存key写入失败, 商品信息: {}", onOrOff, dto);
                throw new RuntimeException("积分商品定时 " + onOrOff + " 缓存key写入失败, 商品信息: " + dto);
            });

        } catch (Exception e) {
            log.error("积分商品定时 {} 缓存key写入失败, 商品信息: {}", onOrOff, dto, e);
            // 重试写入
            int reTryCount = 5;
            long sleepMs = 1000L;
            while (reTryCount > 0) {
                try {
                    log.error("积分商品定时 {} 缓存key写入 [重试] 失败, 剩余 {} 次重试写入, 商品信息: {}", onOrOff, reTryCount, dto);
                    result = redisTemplate.opsForValue().setIfAbsent(key, id, expireSeconds, TimeUnit.SECONDS);
                    if (result != null && result) {
                        break;
                    }
                    Thread.sleep(sleepMs);
                } catch (Exception ex) {
                    log.error("积分商品定时 {} 缓存key写入 [重试] 失败, 剩余 {} 次重试写入, 商品信息: {}", onOrOff, reTryCount, dto, ex);
                }

                sleepMs += sleepMs;
                reTryCount--;
            }

            if (result != null && result) {
                log.info("积分商品定时 {} 缓存key写入 [重试] 成功, 商品信息: {}", onOrOff, dto);
            } else {
                log.error("积分商品定时 {} 缓存key写入 [重试] 失败, 重试次数耗尽, 商品信息: {}", onOrOff, dto);
            }
        }

        return result != null && result;
    }


}