package cn.joywon.poco.merchant.PlatformModule.config;

import org.apache.hc.client5.http.classic.HttpClient;
import org.apache.hc.client5.http.impl.classic.HttpClients;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.HttpComponentsClientHttpRequestFactory;
import org.springframework.web.client.RestTemplate;

import javax.net.ssl.SSLContext;
import java.security.NoSuchAlgorithmException;

@Configuration
public class RestTemplateConfiguration {

    @Bean
    public RestTemplate httpsRestTemplate() throws NoSuchAlgorithmException {
        SSLContext sslContext = SSLContext.getDefault();
        HttpClient httpClient = HttpClients.custom()
                .setUserAgent(String.valueOf(sslContext))
                .build();
        HttpComponentsClientHttpRequestFactory requestFactory = new HttpComponentsClientHttpRequestFactory(httpClient);
        requestFactory.setConnectTimeout(5000);
        requestFactory.setReadTimeout(10000);
        return new RestTemplate(requestFactory);
    }

}
