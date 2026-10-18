package com.cloudflow.common.excel.importing;

import com.cloudflow.common.core.constant.SecurityConstants;
import com.cloudflow.common.core.context.TraceContext;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.core.exception.StorageCapacityError;
import java.io.IOException;
import java.io.OutputStream;
import java.net.http.HttpClient;
import java.nio.file.Path;
import java.time.Duration;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

public class RemoteImportFileStore implements ImportFileStore {
    private final RestClient client;
    private final String serviceName;

    public RemoteImportFileStore(RestClient.Builder builder, String authUrl, String serviceName) {
        this.serviceName = serviceName;
        HttpClient transport = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5))
                .followRedirects(HttpClient.Redirect.NEVER).build();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(transport);
        factory.setReadTimeout(Duration.ofSeconds(60));
        this.client = builder.clone().baseUrl(authUrl).requestFactory(factory).build();
    }

    @Override
    public String save(long taskId, Path source, String fileName, boolean errorFile, Long jobLogId) {
        LinkedMultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        body.add("file", new FileSystemResource(source) {
            @Override public String getFilename() { return fileName; }
        });
        R<String> response;
        try {
            response = client.post().uri(builder -> builder.path("/inner/auth/import-file/{taskId}")
                            .queryParam("errorFile", errorFile).queryParamIfPresent("jobLogId", java.util.Optional.ofNullable(jobLogId)).build(taskId))
                    .headers(this::headers).contentType(MediaType.MULTIPART_FORM_DATA).body(body).retrieve()
                    .body(new ParameterizedTypeReference<R<String>>() { });
        } catch (RestClientResponseException exception) {
            if (StorageCapacityError.matches(exception.getStatusCode().value(), exception.getResponseBodyAsString())) {
                throw StorageCapacityError.exception();
            }
            throw new ServiceException("导入文件保存失败");
        } catch (RestClientException exception) {
            throw new ServiceException("导入文件保存失败");
        }
        if (response == null || !response.isSuccess() || response.getData() == null) throw new ServiceException("导入文件保存失败");
        return response.getData();
    }

    @Override
    public void clearError(long taskId, Long jobLogId) {
        R<Void> response = client.delete().uri(builder -> builder.path("/inner/auth/import-file/{taskId}/errors")
                        .queryParamIfPresent("jobLogId", java.util.Optional.ofNullable(jobLogId)).build(taskId))
                .headers(this::headers).retrieve().body(new ParameterizedTypeReference<R<Void>>() { });
        if (response == null || !response.isSuccess()) throw new ServiceException("旧错误文件清理失败");
    }

    @Override
    public void clearCompletedOriginal(long taskId, Long jobLogId) {
        R<Void> response = client.delete().uri(builder -> builder.path("/inner/auth/import-file/{taskId}/original")
                        .queryParamIfPresent("jobLogId", java.util.Optional.ofNullable(jobLogId)).build(taskId))
                .headers(this::headers).retrieve().body(new ParameterizedTypeReference<R<Void>>() { });
        if (response == null || !response.isSuccess()) throw new ServiceException("导入原文件清理失败");
    }

    @Override
    public void copy(long taskId, boolean errorFile, OutputStream target) throws IOException {
        client.get().uri("/inner/auth/import-file/{taskId}/content?errorFile={errorFile}", taskId, errorFile)
                .headers(this::headers).exchange((request, response) -> {
                    if (!response.getStatusCode().is2xxSuccessful()) throw new ServiceException("导入文件读取失败或无权访问");
                    response.getBody().transferTo(target);
                    return null;
                });
    }

    private void headers(HttpHeaders headers) {
        if (UserContext.getUserId() == null || UserContext.getTenantId() == null || UserContext.getAuthToken() == null) {
            throw new ServiceException("导入文件操作需要有效登录身份", 403);
        }
        headers.set(SecurityConstants.INNER_CALL_HEADER, SecurityConstants.INNER_CALL_VALUE);
        headers.set(SecurityConstants.FROM_SERVICE_HEADER, serviceName);
        headers.set(SecurityConstants.TENANT_ID_HEADER, String.valueOf(UserContext.getTenantId()));
        headers.setBearerAuth(UserContext.getAuthToken());
        headers.set(TraceContext.HEADER, TraceContext.currentOrCreate());
    }
}
