package cn.joywon.poco.knowledge.support.constant;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

/**
 * @author poco
 * @date 2024/10/12
 * <p>
 * SUCCESSED：任务执行成功
 * <p>
 * FAILED：任务执行失败
 * <p>
 * CANCELED：任务被取消
 * <p>
 * PENDING：任务排队中
 * <p>
 * SUSPENDED：任务挂起
 * <p>
 * RUNNING：任务处理中
 */
@Getter
@RequiredArgsConstructor
public enum ImageTaskStatusEnums {

	SUCCESSED("SUCCESSED", "任务执行成功"),

	FAILED("FAILED", "任务执行失败");

	private final String code;

	private final String desc;

}
