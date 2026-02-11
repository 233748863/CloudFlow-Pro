package cn.joywon.poco.knowledge.service;

import com.baomidou.mybatisplus.extension.service.IService;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.knowledge.dto.AiFlowExecuteDTO;
import cn.joywon.poco.knowledge.entity.AiFlowEntity;
import jakarta.servlet.http.HttpServletResponse;

public interface AiFlowService extends IService<AiFlowEntity> {

    /**
     * 执行流程
     *
     * @param executeDTO 执行 DTO
     * @return {@link R }
     */
    R executeFlow(AiFlowExecuteDTO executeDTO);

    /**
     * 复制流
     *
     * @param id id
     * @return {@link R }
     */
    R copyFlow(Long id);

    /**
     * 导出流程
     *
     * @param id       id
     * @param response 响应
     */
    void exportFlow(Long id, HttpServletResponse response);
}
