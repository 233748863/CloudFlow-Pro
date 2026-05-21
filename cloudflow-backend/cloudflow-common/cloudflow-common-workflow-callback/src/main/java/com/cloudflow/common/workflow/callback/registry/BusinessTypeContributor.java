package com.cloudflow.common.workflow.callback.registry;

/**
 * 业务类型契约贡献者。
 *
 * <p>各业务模块（HR / OA / CRM 等）实现本接口并通过 Spring Bean 暴露，
 * {@code BusinessTypeRegistrar} 会在容器启动期收集所有实现并依次调用 {@link #contribute(BusinessTypeRegistry)}。
 *
 * <p>典型用法：
 * <pre>
 * &#64;Configuration
 * public class HrBusinessTypeContributor implements BusinessTypeContributor {
 *     &#64;Override
 *     public void contribute(BusinessTypeRegistry registry) {
 *         registry.register(BusinessTypeDef.builder()
 *             .code("HR_RECRUITMENT").module("hr").businessTable("hr_recruitment_requisition")
 *             .displayName("招聘需求审批").build());
 *     }
 * }
 * </pre>
 */
@FunctionalInterface
public interface BusinessTypeContributor {

    void contribute(BusinessTypeRegistry registry);
}
