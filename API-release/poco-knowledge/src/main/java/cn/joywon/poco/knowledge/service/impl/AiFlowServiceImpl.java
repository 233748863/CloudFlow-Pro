package cn.joywon.poco.knowledge.service.impl;

import cn.hutool.core.io.IoUtil;
import cn.hutool.core.util.StrUtil;
import cn.hutool.json.JSONUtil;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.knowledge.dto.AiFlowExecuteDTO;
import cn.joywon.poco.knowledge.entity.AiFlowEntity;
import cn.joywon.poco.knowledge.mapper.AiFlowMapper;
import cn.joywon.poco.knowledge.service.AiFlowService;
import cn.joywon.poco.knowledge.support.flow.core.FlowException;
import cn.joywon.poco.knowledge.support.flow.model.AiFlowDSLDefinition;
import cn.joywon.poco.knowledge.support.flow.model.processor.AiFlowProcessor;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.SneakyThrows;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;

/**
 * 大模型流程表
 *
 * @author poco
 * @date 2025-03-03 10:21:32
 */
@Service
@RequiredArgsConstructor
public class AiFlowServiceImpl extends ServiceImpl<AiFlowMapper, AiFlowEntity> implements AiFlowService {

    private final AiFlowProcessor flowProcessor;

    private final AiFlowMapper aiFlowMapper;

    /**
     * 执行流程
     *
     * @param executeDTO 执行 DTO
     * @return {@link R }
     */
    @Override
    public R executeFlow(AiFlowExecuteDTO executeDTO) {
        // 获取工作流详情
        AiFlowEntity flow = aiFlowMapper.selectById(executeDTO.getId());
        if (flow == null) {
            throw FlowException.invalidFlow("未找到指定工作流");
        }

        String dslValue = flow.getDsl();
        if (StrUtil.isBlank(dslValue)) {
            throw FlowException.invalidDSL("工作流DSL不能为空");
        }

        AiFlowDSLDefinition dsl = JSONUtil.toBean(dslValue, AiFlowDSLDefinition.class);
        if (dsl == null) {
            throw FlowException.invalidDSL("工作流DSL解析失败");
        }

        try {
            // 执行工作流
            return R.ok(flowProcessor.execute(flow, dsl, executeDTO));
        } catch (Exception e) {
            throw FlowException.executeError(e.getMessage());
        }
    }

    /**
     * 复制流
     *
     * @param id id
     * @return {@link R }
     */
    @Override
    public R copyFlow(Long id) {
        AiFlowEntity aiFlowEntity = baseMapper.selectById(id);
        aiFlowEntity.setId(null);
        aiFlowEntity.setName(aiFlowEntity.getName() + "Copy");
        baseMapper.insert(aiFlowEntity);
        return R.ok();
    }

    /**
     * 导出流程
     *
     * @param id       id
     * @param response 响应
     */
    @SneakyThrows
    @Override
    public void exportFlow(Long id, HttpServletResponse response) {
        AiFlowEntity aiFlowEntity = baseMapper.selectById(id);
        aiFlowEntity.setId(null);
        String jsonPrettyStr = JSONUtil.toJsonPrettyStr(aiFlowEntity);

        // zip压缩包数据
        byte[] data = jsonPrettyStr.getBytes(StandardCharsets.UTF_8);

        response.reset();
        response.setHeader(HttpHeaders.CONTENT_DISPOSITION, String.format("attachment; filename=%s.dsl", aiFlowEntity.getName()));
        response.addHeader(HttpHeaders.CONTENT_LENGTH, String.valueOf(data.length));
        response.setContentType("application/octet-stream; charset=UTF-8");
        IoUtil.write(response.getOutputStream(), false, data);
    }
}
