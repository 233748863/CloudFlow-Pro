package cn.joywon.poco.knowledge.service;

import com.baomidou.mybatisplus.extension.service.IService;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.knowledge.dto.AiMessageResultDTO;
import cn.joywon.poco.knowledge.dto.AiPosterDTO;
import cn.joywon.poco.knowledge.entity.AiPosterEntity;
import reactor.core.publisher.Flux;

public interface AiPosterService extends IService<AiPosterEntity> {

    /**
     * 生成海报
     *
     * @param posterDTO 海报 DTO
     * @return {@link R }
     */
    Flux<AiMessageResultDTO> generatePoster(AiPosterDTO posterDTO);
}
