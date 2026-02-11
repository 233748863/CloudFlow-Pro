package cn.joywon.poco.common.sse.config;

import cn.joywon.poco.common.security.util.SecurityUtils;
import cn.joywon.poco.common.sse.holder.SseEmitterHolder;
import lombok.RequiredArgsConstructor;
import lombok.SneakyThrows;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.Objects;

/**
 * @author poco
 * @date 2023/12/11
 */
@Slf4j
@RestController
@RequiredArgsConstructor
@RequestMapping("/sse")
public class SseEmitterEndpoint {

    @SneakyThrows
    @RequestMapping("/info")
    public SseEmitter info() {
        SseEmitter sseEmitter = new SseEmitter(0L);

        if (Objects.isNull(SecurityUtils.getUser())) {
            log.debug("MSG: SseConnectError");
            return null;
        }

        Long userId = SecurityUtils.getUser().getId();
        log.info("MSG: SseConnect | EmitterHash: {} | ID: {}", sseEmitter.hashCode(), SecurityUtils.getUser().getId());
        sseEmitter.onCompletion(() -> {
            log.info("MSG: SseConnectCompletion | EmitterHash: {} |ID: {}", sseEmitter.hashCode(),
                    SecurityUtils.getUser().getId());
            SseEmitterHolder.removeSseEmitter(sseEmitter);
        });
        sseEmitter.onTimeout(() -> {
            log.error("MSG: SseConnectTimeout | EmitterHash: {} |ID: {} ", sseEmitter.hashCode(),
                    SecurityUtils.getUser().getId());
            SseEmitterHolder.removeSseEmitter(sseEmitter);
        });
        sseEmitter.onError(t -> {
            log.error("MSG: SseConnectError | EmitterHash: {} |ID: {}", sseEmitter.hashCode(),
                    SecurityUtils.getUser().getId());
            SseEmitterHolder.removeSseEmitter(sseEmitter);
        });
        SseEmitterHolder.addSseEmitter(userId, sseEmitter);
        sseEmitter.send("pong");
        return sseEmitter;
    }

}
