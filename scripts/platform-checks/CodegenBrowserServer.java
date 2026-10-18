import com.cloudflow.auth.controller.SysCodegenController;
import com.cloudflow.auth.service.ISysCodegenService;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.GlobalExceptionHandler;
import com.cloudflow.common.tenant.TenantContext;
import jakarta.servlet.Filter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.apache.catalina.Context;
import org.apache.catalina.Wrapper;
import org.apache.catalina.startup.Tomcat;
import org.apache.tomcat.util.descriptor.web.FilterDef;
import org.apache.tomcat.util.descriptor.web.FilterMap;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.MapPropertySource;
import org.springframework.web.context.support.AnnotationConfigWebApplicationContext;
import org.springframework.web.servlet.DispatcherServlet;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

public final class CodegenBrowserServer {
    private static ISysCodegenService service;

    @Configuration(proxyBeanMethods = false)
    @EnableWebMvc
    public static class HttpConfiguration {
        @Bean
        public SysCodegenController codegenController() { return new SysCodegenController(service); }

        @Bean
        public GlobalExceptionHandler globalExceptionHandler() { return new GlobalExceptionHandler(); }
    }

    public static void serve(ISysCodegenService implementation, Path directory) throws Exception {
        serve(implementation, directory, null);
    }

    public static void serve(ISysCodegenService implementation, Path directory, CodegenMenuChecks menus) throws Exception {
        service = implementation;
        String token = System.getenv("A1_CODEGEN_BROWSER_KEY");
        if (token == null || !token.matches("[a-f0-9]{64}")) throw new IllegalArgumentException("Missing browser verification key");
        Files.createDirectories(directory);
        AnnotationConfigWebApplicationContext web = new AnnotationConfigWebApplicationContext();
        web.getEnvironment().getPropertySources().addFirst(new MapPropertySource("owned-codegen-browser", Map.of("cloudflow.codegen.enabled", "true")));
        web.register(HttpConfiguration.class);
        if (menus != null) menus.configure(web);
        Tomcat server = new Tomcat();
        server.setBaseDir(directory.resolve("tomcat").toString());
        server.setPort(0);
        server.getConnector().setProperty("address", "127.0.0.1");
        Context context = server.addContext("", directory.toString());
        context.setParentClassLoader(CodegenBrowserServer.class.getClassLoader());
        AtomicInteger calls = new AtomicInteger();
        Filter identity = (request, response, chain) -> {
            HttpServletRequest incoming = (HttpServletRequest) request;
            if (!token.equals(incoming.getHeader("X-A1-Verification-Key"))) {
                ((HttpServletResponse) response).sendError(403);
                return;
            }
            calls.incrementAndGet();
            try {
                if (menus == null) {
                    UserContext.setTenantId(100000L);
                    TenantContext.setTenantId(100000L);
                    UserContext.setUserId(1L);
                    UserContext.setUserName("codegen-browser-fixture");
                } else if (!menus.identify(incoming.getHeader("X-A1-Menu-Actor"))) {
                    ((HttpServletResponse) response).sendError(403);
                    return;
                }
                chain.doFilter(request, response);
            }
            finally { UserContext.clear(); TenantContext.clear(); }
        };
        FilterDef definition = new FilterDef();
        definition.setFilterName("owned-browser-identity");
        definition.setFilter(identity);
        context.addFilterDef(definition);
        FilterMap mapping = new FilterMap();
        mapping.setFilterName(definition.getFilterName());
        mapping.addURLPattern("/*");
        context.addFilterMap(mapping);
        Wrapper servlet = Tomcat.addServlet(context, "codegen", new DispatcherServlet(web));
        servlet.setLoadOnStartup(1);
        context.addServletMappingDecoded("/", "codegen");
        try {
            server.start();
            System.out.println("CODEGEN_BROWSER_BASE=http://127.0.0.1:" + server.getConnector().getLocalPort() + "/system/codegen");
            System.out.flush();
            while (System.in.read() != -1) { }
        } finally {
            server.stop();
            server.destroy();
            web.close();
            service = null;
            System.out.println("CODEGEN_BROWSER_HTTP_CLOSED: requests=" + calls.get() + "; running_service_restarts=0");
        }
    }
}
