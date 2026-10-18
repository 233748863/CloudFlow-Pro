package com.cloudflow.auth.service.jobclient;

import com.cloudflow.common.job.security.JobRequestSignature;
import feign.Capability;
import feign.Client;
import feign.Request;
import org.springframework.http.HttpHeaders;

import java.net.URI;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.Map;

/** Signs the final outgoing request after the ordinary tenant and login interceptors. */
public final class JobFeignSigningCapability implements Capability {
    private final JobRequestSignature signature;
    public JobFeignSigningCapability(JobRequestSignature signature) { this.signature = signature; }

    @Override
    public Client enrich(Client client) {
        return (request, options) -> {
            URI uri = URI.create(request.url());
            HttpHeaders headers = new HttpHeaders();
            request.headers().forEach((name, values) -> headers.put(name, new ArrayList<>(values)));
            signature.sign(headers, request.httpMethod().name(), JobRequestSignature.requestTarget(uri), uri.getHost(), request.body());
            Map<String, Collection<String>> signedHeaders = new LinkedHashMap<>();
            headers.forEach((name, values) -> signedHeaders.put(name, new ArrayList<>(values)));
            Request signed = Request.create(request.httpMethod(), request.url(), signedHeaders,
                    request.body(), request.charset(), request.requestTemplate());
            return client.execute(signed, options);
        };
    }
}
