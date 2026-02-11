package cn.joywon.poco.knowledge.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import cn.joywon.poco.knowledge.entity.AiFlowLogEntity;
import cn.joywon.poco.knowledge.mapper.AiFlowLogMapper;
import cn.joywon.poco.knowledge.service.AiFlowLogService;
import org.springframework.stereotype.Service;

/**
 * 大模型流程日志表
 *
 * @author poco
 * @date 2025-03-03 10:21:15
 */
@Service
public class AiFlowLogServiceImpl extends ServiceImpl<AiFlowLogMapper, AiFlowLogEntity> implements AiFlowLogService {
}
