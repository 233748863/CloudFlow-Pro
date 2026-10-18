package com.cloudflow.auth.service.jobclient;

import com.cloudflow.common.job.security.JobRequestSignature;
import feign.Capability;
import org.springframework.context.annotation.Bean;

/** This configuration belongs only to the five job clients, not other internal Feign APIs. */
public class JobFeignConfiguration {
    @Bean
    public Capability jobSigningCapability(JobRequestSignature signature) { return new JobFeignSigningCapability(signature); }
}
