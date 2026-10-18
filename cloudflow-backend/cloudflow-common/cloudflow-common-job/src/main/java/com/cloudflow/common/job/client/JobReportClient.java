package com.cloudflow.common.job.client;

import com.cloudflow.common.core.constant.SecurityConstants;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.context.TraceContext;
import com.cloudflow.common.job.model.HandlerInfo;
import com.cloudflow.common.job.model.HandlerReportDTO;
import com.cloudflow.common.job.model.JobResultReportDTO;
import com.cloudflow.common.job.model.BusinessJobStartRequest;
import com.cloudflow.common.job.model.JobExecuteDTO;
import com.cloudflow.common.job.security.JobRequestSignature;
import com.cloudflow.common.core.domain.R;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.client.loadbalancer.LoadBalancerClient;
import org.springframework.cloud.client.loadbalancer.LoadBalancerInterceptor;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;
import lombok.extern.slf4j.Slf4j;

import java.util.List;
import java.util.Objects;

/**
 * 业务服务向 auth 回报 Handler 清单和异步执行结果的统一客户端。
 * 回报失败只记录本地日志，不影响任务本身的执行状态缓存。
 */
@Component
@Slf4j
public class JobReportClient {
    private final RestClient restClient;
    private final String serviceName;
    private final boolean enabled;

    public JobReportClient(RestClient.Builder builder,
                           @Value("${spring.application.name:cloudflow-service}") String serviceName,
                           @Value("${cloudflow.job.auth-url:}") String authUrl,
                           @Value("${cloudflow.job.report-enabled:true}") boolean enabled,
                           JobRequestSignature signature,
                           LoadBalancerClient loadBalancer) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(3000);
        factory.setReadTimeout(10000);
        boolean explicitAddress = StringUtils.hasText(authUrl);
        RestClient.Builder reportBuilder = builder.clone().requestFactory(factory)
                .baseUrl(explicitAddress ? authUrl : "http://cloudflow-auth");
        if (!explicitAddress) {
            reportBuilder.requestInterceptor(new LoadBalancerInterceptor(
                    Objects.requireNonNull(loadBalancer, "任务回报需要现有服务发现客户端")));
        }
        this.restClient = reportBuilder.requestInterceptor((request, body, execution) -> {
                    signature.sign(request.getHeaders(), request.getMethod().name(),
                            JobRequestSignature.requestTarget(request.getURI()), "cloudflow-auth", body);
                    return execution.execute(request, body);
                })
                .build();
        this.serviceName = serviceName;
        // auth 也承载自身的内置 Handler；其任务通过统一执行端点回报，
        // 因而不能按服务名静默关闭回报链路。
        this.enabled = enabled;
    }

    public void reportHandlers(List<HandlerInfo> handlers) {
        if (!enabled) {
            return;
        }
        HandlerReportDTO request = new HandlerReportDTO();
        request.setServiceName(serviceName);
        request.setHandlers(handlers);
        try {
            restClient.post().uri("/inner/job/handler/report")
                    .headers(headers -> addHeaders(headers))
                    .body(request).retrieve()
                    .onStatus(HttpStatusCode::isError, (req, res) -> {
                        throw new IllegalStateException("Handler 清单回报失败");
                    }).toBodilessEntity();
        } catch (RuntimeException e) {
            // auth 暂不可用时，下次启动或运维触发注册即可恢复，不阻塞业务服务启动。
            log.debug("任务 Handler 清单回报失败，service={}", serviceName);
        }
    }

    public JobExecuteDTO registerBusinessJob(BusinessJobStartRequest request) {
        if (!enabled) throw new IllegalStateException("集中任务回报已关闭，无法提交后台业务任务");
        R<JobExecuteDTO> response = restClient.post().uri("/inner/job/business/register")
                .headers(this::addHeaders).body(request).retrieve()
                .body(new ParameterizedTypeReference<R<JobExecuteDTO>>() { });
        if (response == null || !response.isSuccess() || response.getData() == null) {
            throw new IllegalStateException("集中任务登记失败，请检查任务配置");
        }
        return response.getData();
    }

    public void reportResult(JobResultReportDTO request) {
        if (!enabled || request == null) {
            return;
        }
        try {
            restClient.post().uri("/inner/job/report")
                    .headers(headers -> addHeaders(headers))
                    .body(request).retrieve()
                    .onStatus(HttpStatusCode::isError, (req, res) -> {
                        throw new IllegalStateException("任务结果回报失败");
                    }).toBodilessEntity();
        } catch (RuntimeException e) {
            // 结果缓存仍可供 auth 反查，避免短暂网络抖动导致误判。
            log.debug("任务结果回报失败，service={}, executeNo={}", serviceName, request.getExecuteNo());
        }
    }

    private void addHeaders(org.springframework.http.HttpHeaders headers) {
        headers.set(TraceContext.HEADER, TraceContext.currentOrCreate());
        headers.set(SecurityConstants.INNER_CALL_HEADER, SecurityConstants.INNER_CALL_VALUE);
        headers.set(SecurityConstants.FROM_SERVICE_HEADER, serviceName);
        Long tenantId = UserContext.getTenantId();
        if (tenantId != null) {
            headers.set(SecurityConstants.TENANT_ID_HEADER, String.valueOf(tenantId));
        }
    }
}
