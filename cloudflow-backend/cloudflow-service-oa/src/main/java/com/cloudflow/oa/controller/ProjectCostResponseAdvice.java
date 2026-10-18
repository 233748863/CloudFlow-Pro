package com.cloudflow.oa.controller;

import cn.dev33.satoken.stp.StpUtil;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.oa.domain.OaProject;
import com.cloudflow.oa.domain.vo.ProjectCostSummaryVO;
import com.cloudflow.oa.domain.vo.ProjectDetailVO;
import org.springframework.core.MethodParameter;
import org.springframework.http.MediaType;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseBodyAdvice;

@ControllerAdvice(assignableTypes = ProjectController.class)
public class ProjectCostResponseAdvice implements ResponseBodyAdvice<Object> {
    @Override
    public boolean supports(MethodParameter returnType, Class<? extends HttpMessageConverter<?>> converter) {
        return true;
    }

    @Override
    public Object beforeBodyWrite(Object body, MethodParameter returnType, MediaType contentType,
                                  Class<? extends HttpMessageConverter<?>> converter,
                                  ServerHttpRequest request, ServerHttpResponse response) {
        if (body instanceof R<?> result && result.isSuccess() && !StpUtil.hasPermission("oa:activity-cost:list")) {
            conceal(result.getData());
        }
        return body;
    }

    private static void conceal(Object data) {
        if (data instanceof OaProject project) {
            project.setLaborCostAmount(null);
            project.setActualCostAmount(null);
            project.setEstimatedCost(null);
            project.setGrossMargin(null);
            project.setGrossMarginRate(null);
        } else if (data instanceof ProjectCostSummaryVO summary) {
            summary.setLaborAmount(null);
            summary.setTotalAmount(null);
        } else if (data instanceof ProjectDetailVO detail) {
            conceal(detail.getProject());
            conceal(detail.getCostSummary());
            if (detail.getKpi() != null) detail.getKpi().setCostExecutionRate(null);
        } else if (data instanceof PageResult<?> page) {
            conceal(page.getRows());
        } else if (data instanceof Iterable<?> values) {
            for (Object value : values) conceal(value);
        }
    }
}
