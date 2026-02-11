package cn.joywon.poco.knowledge.support.flow.core;

import cn.hutool.core.lang.Dict;
import cn.hutool.core.util.StrUtil;
import com.baomidou.mybatisplus.core.toolkit.StringPool;
import cn.joywon.poco.knowledge.support.flow.constants.FlowConstant;
import lombok.Data;
import lombok.Getter;
import lombok.experimental.FieldNameConstants;

import java.util.HashMap;
import java.util.Map;

/**
 * 工作流执行上下文
 */
@Data
@FieldNameConstants
public class FlowContextHolder {

    /**
     * 工作流ID
     */
    private final Long flowId;

    /**
     * 工作流类型
     */
    private final String type;

    /**
     * 环境变量
     */
    private Map<String, Object> envs;

    /**
     * 变量映射(每个节点执行完毕后的返回值集合)
     */
    @Getter
    private final Map<String, Object> variables;

    /**
     * 参数映射(调用接口时传递的完整参数集合)
     */
    @Getter
    private final Map<String, Object> parameters;

    /**
     * 分支状态
     */
    private final Map<String, Integer> activeBranches;

    /**
     * Token使用量
     */
    private long totalTokens;

    /**
     * 开始时间
     */
    private final long startTime;

    public FlowContextHolder(Long flowId, String type) {
        this.flowId = flowId;
        this.type = type;
        this.variables = new HashMap<>();
        this.parameters = new HashMap<>();
        this.activeBranches = new HashMap<>();
        this.startTime = System.currentTimeMillis();
    }

    /**
     * 获取节点变量名
     *
     * @param nodeId 节点ID
     * @param key    变量名
     * @return 变量名(包含节点ID前缀)
     */
    public String getNodeKey(String nodeId, String key) {
        return nodeId + StringPool.DOT + key;
    }

    /**
     * 获取变量值
     *
     * @param key 变量名(包含节点ID前缀)
     * @return 变量值
     */
    public Object getVariable(String key) {
        Object obj = variables.get(key);
        // 如果变量值为空且变量名不包含节点ID前缀，则直接返回变量名本身(用户手动输入固定数值的情况)
        if (obj == null && !StrUtil.containsAnyIgnoreCase(key, StringPool.DOT)) {
            return key;
        }

        if (obj == null) {
            return parameters.get(key) == null ? envs.get(key) : parameters.get(key);
        }
        return obj;
    }

    /**
     * 获取变量值
     *
     * @param nodeId 节点ID
     * @param key    变量名
     * @return 变量值
     */
    public Object getVariable(String nodeId, String key) {
        return variables.get(getNodeKey(nodeId, key));
    }

    /**
     * 设置变量值
     *
     * @param key   变量名
     * @param value 变量值
     */
    public void setVariable(String key, Object value) {
        variables.put(key, value);
    }

    /**
     * 设置变量值
     *
     * @param nodeId 节点ID
     * @param key    变量名
     * @param value  变量值
     */
    public void setVariable(String nodeId, String key, Object value) {
        variables.put(getNodeKey(nodeId, key), value);
    }

    /**
     * 设置变量值集合
     *
     * @param nodeId 节点ID
     * @param kv     变量集合
     */
    public void setVariables(String nodeId, Dict kv) {
        kv.forEach((k, v) -> variables.put(getNodeKey(nodeId, k), v));
    }

    /**
     * 获取参数值
     *
     * @param key 参数名
     * @return 参数值
     */
    public Object getParameter(String key) {
        return parameters.get(key);
    }

    /**
     * 设置参数值
     *
     * @param key   参数名
     * @param value 参数值
     */
    public void setParameter(String key, Object value) {
        parameters.put(key, value);
    }

    /**
     * 设置参数值
     *
     * @param kv 参数集合
     */
    public void setParameters(Dict kv) {
        parameters.putAll(kv);
    }

    /**
     * 获取分支状态
     *
     * @param nodeId 节点ID
     * @return 状态
     */
    public Integer getBranchStatus(String nodeId) {
        return activeBranches.get(nodeId);
    }

    /**
     * 设置分支状态
     *
     * @param nodeId 节点ID
     * @param status 状态
     */
    public void setBranchStatus(String nodeId, Integer status) {
        activeBranches.put(nodeId, status);
    }

    /**
     * 增加Token使用量
     *
     * @param tokens Token数量
     */
    public void addTokens(long tokens) {
        this.totalTokens += tokens;
    }

    /**
     * 获取执行时长
     */
    public long getDuration() {
        return System.currentTimeMillis() - startTime;
    }

    /**
     * 获取执行结果
     *
     * @return 执行结果
     */
    public Object getResult() {
        return variables.get(FlowConstant.RESULT);
    }
}
