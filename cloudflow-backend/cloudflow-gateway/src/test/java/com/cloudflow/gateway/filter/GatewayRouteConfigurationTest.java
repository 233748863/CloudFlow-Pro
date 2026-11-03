package com.cloudflow.gateway.filter;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.cloud.gateway.config.GatewayProperties;
import org.springframework.cloud.gateway.config.GlobalCorsProperties;
import org.springframework.cloud.gateway.route.RouteDefinition;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.PropertySource;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.HttpMethod;
import org.springframework.web.cors.CorsConfiguration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class GatewayRouteConfigurationTest {
    private StandardEnvironment configuration() throws Exception {
        StandardEnvironment environment = new StandardEnvironment();
        environment.getPropertySources().addFirst(new MapPropertySource("test-portal-origin",
                Map.of("cloudflow.portal.public-url", "https://portal.example.invalid")));
        for (PropertySource<?> source : new YamlPropertySourceLoader().load("gateway-override",
                new FileSystemResource("../../config/cloudflow-gateway.yaml"))) {
            environment.getPropertySources().addLast(source);
        }
        return environment;
    }

    @Test
    void externalOverrideRetainsOauthAndPortalRoutesWithoutRemovingTheirPrefixes() throws Exception {
        GatewayProperties properties = Binder.get(configuration()).bind("spring.cloud.gateway", GatewayProperties.class).get();
        for (Map.Entry<String, String> expected : Map.of("cloudflow-oauth2", "/oauth2/**", "cloudflow-portal-auth", "/portal/**").entrySet()) {
            RouteDefinition route = properties.getRoutes().stream().filter(item -> item.getId().equals(expected.getKey())).findFirst().orElseThrow();
            assertEquals("lb://cloudflow-auth", route.getUri().toString());
            assertTrue(route.getPredicates().stream().anyMatch(predicate -> predicate.getName().equals("Path")
                    && predicate.getArgs().containsValue(expected.getValue())));
            assertFalse(route.getFilters().stream().anyMatch(filter -> filter.getName().equals("StripPrefix")));
        }
        assertTrue(properties.getRoutes().stream().anyMatch(route -> route.getId().equals("cloudflow-workflow")));
        assertTrue(properties.getRoutes().stream().anyMatch(route -> route.getId().equals("cloudflow-ws")));
    }

    @Test
    void corsUsesTheConfiguredPortalOriginAndExposesOnlyItsRequiredResponseHeaders() throws Exception {
        GlobalCorsProperties properties = Binder.get(configuration()).bind("spring.cloud.gateway.globalcors", GlobalCorsProperties.class).get();
        CorsConfiguration portal = properties.getCorsConfigurations().get("/portal/**");
        assertNotNull(portal);
        assertEquals("https://portal.example.invalid", portal.checkOrigin("https://portal.example.invalid"));
        assertNull(portal.checkOrigin("https://untrusted.example.invalid"));
        assertFalse(portal.getAllowCredentials());
        assertNotNull(portal.checkHttpMethod(HttpMethod.DELETE));
        assertNull(portal.checkHttpMethod(HttpMethod.PUT));
        assertNotNull(portal.checkHeaders(List.of("portal-token", "Content-Type")));
        assertTrue(portal.getExposedHeaders().containsAll(List.of("X-Trace-Id", "Retry-After")));
        CorsConfiguration unsubscribe = properties.getCorsConfigurations().get("/crm/track/unsubscribe");
        assertNotNull(unsubscribe);
        assertEquals("*", unsubscribe.checkOrigin("https://mail.example.invalid"));
        assertFalse(unsubscribe.getAllowCredentials());
        assertTrue(properties.getCorsConfigurations().get("/**").getExposedHeaders().contains("X-Trace-Id"));
    }
}
