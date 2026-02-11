package cn.joywon.poco.knowledge.support.flow.constants;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

/**
 * @author poco
 * @date 2025/3/3
 */
@RequiredArgsConstructor
public enum ExecutionStatusEnums {

    PENDING("pending", "等待执行"),
    RUNNING("running", "正在执行"),
    SUCCESS("success", "执行成功"),
    ERROR("error", "执行失败"),
    SKIPPED("skipped", "已跳过");


    @Getter
    private final String value;

    private final String desc;
}
