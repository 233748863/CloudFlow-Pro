package cn.joywon.poco.flow.engine.expression.condition;

import cn.joywon.poco.flow.task.dto.Condition;

/**
 * 节点单个条件处理器
 */
public interface NodeConditionStrategy {

	/**
	 * 抽象方法 处理表达式
	 */
	String handle(Condition condition);

}
