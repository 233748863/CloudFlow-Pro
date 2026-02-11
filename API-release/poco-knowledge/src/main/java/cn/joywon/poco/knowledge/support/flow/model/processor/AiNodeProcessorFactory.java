package cn.joywon.poco.knowledge.support.flow.model.processor;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.Map;

/**
 * AI Node Processor 工厂
 *
 * @author poco
 * @date 2025/03/03
 */
@Service
@RequiredArgsConstructor
public class AiNodeProcessorFactory {

    /**
     * 处理器列表
     */
    private final Map<String, AiNodeProcessor> processorMap;

    /**
     * 获取节点处理器
     *
     * @param type 节点类型
     * @return 节点处理器
     */
    public AiNodeProcessor getProcessor(String type) {
        AiNodeProcessor processor = processorMap.get(type);
        if (processor == null) {
            throw new RuntimeException("未知的节点类型: " + type);
        }
        return processor;
    }
}
