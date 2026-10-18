package com.cloudflow.auth.im;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.Proxy;
import java.net.ProxySelector;
import java.net.SocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Flow;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.function.UnaryOperator;

final class WeComHttp {
    static final int MAX_RESPONSE_BYTES = 1024 * 1024;
    private static final Set<String> READ_PATHS = Set.of("/cgi-bin/gettoken", "/cgi-bin/user/getuserinfo",
            "/cgi-bin/auth/getuserinfo", "/cgi-bin/department/list", "/cgi-bin/user/list", "/cgi-bin/user/get", "/cgi-bin/agent/get");
    private static final Set<String> WRITE_PATHS = Set.of("/cgi-bin/message/send", "/cgi-bin/message/recall",
            "/cgi-bin/message/update_template_card");
    private final HttpClient client;
    private final UnaryOperator<URI> target;
    private final Duration timeout;
    private final ObjectMapper json = new ObjectMapper().enable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION)
            .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS);

    WeComHttp() {
        this(directClient(), UnaryOperator.identity(), Duration.ofSeconds(15));
    }

    WeComHttp(HttpClient client, UnaryOperator<URI> target, Duration timeout) {
        if (client.followRedirects() != HttpClient.Redirect.NEVER) throw ImFailure.configuration();
        this.client = client;
        this.target = target;
        this.timeout = timeout;
    }

    static HttpClient directClient() {
        return HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).followRedirects(HttpClient.Redirect.NEVER)
                .proxy(new ProxySelector() {
                    @Override
                    public List<Proxy> select(URI uri) { return List.of(Proxy.NO_PROXY); }

                    @Override
                    public void connectFailed(URI uri, SocketAddress address, IOException failure) { }
                }).build();
    }

    String exchange(String method, URI officialUri, String content) {
        validate(method, officialUri);
        boolean writing = "POST".equals(method);
        if (writing && (content == null || content.getBytes(StandardCharsets.UTF_8).length > MAX_RESPONSE_BYTES)) {
            throw ImFailure.configuration();
        }
        CompletableFuture<HttpResponse<byte[]>> pending = null;
        Duration requestTimeout = ImSyncBudget.active() ? ImSyncBudget.limit(timeout) : timeout;
        try {
            HttpRequest.Builder builder = HttpRequest.newBuilder(target.apply(officialUri)).timeout(requestTimeout)
                    .header("Accept", "application/json");
            if (writing) builder.header("Content-Type", "application/json; charset=UTF-8").POST(HttpRequest.BodyPublishers.ofString(content));
            else builder.GET();
            pending = client.sendAsync(builder.build(), information -> new BoundedBody());
            HttpResponse<byte[]> response = pending.get(requestTimeout.toNanos(), TimeUnit.NANOSECONDS);
            if (response.statusCode() != 200) throw writing ? ImFailure.uncertain() : ImFailure.remote();
            JsonNode result = json.readTree(response.body());
            if (result == null || !result.isObject()) {
                throw writing ? ImFailure.uncertain() : ImFailure.remote();
            }
            if (result.has("errcode")) {
                if (!result.path("errcode").isIntegralNumber() || !result.path("errcode").canConvertToInt()) {
                    throw writing ? ImFailure.uncertain() : ImFailure.remote();
                }
                int errorCode = result.path("errcode").intValue();
                if (errorCode == 40014 || errorCode == 42001 || errorCode == 40001) throw ImFailure.tokenRejected();
                if (errorCode != 0) throw ImFailure.remote(errorCode);
            } else if (!"/cgi-bin/gettoken".equals(officialUri.getPath())) {
                throw writing ? ImFailure.uncertain() : ImFailure.remote();
            }
            return new String(response.body(), StandardCharsets.UTF_8);
        } catch (ImFailure failure) {
            throw failure;
        } catch (InterruptedException failure) {
            Thread.currentThread().interrupt();
            throw writing ? ImFailure.uncertain() : ImFailure.remote();
        } catch (IOException | ExecutionException | TimeoutException | RuntimeException failure) {
            throw writing ? ImFailure.uncertain() : ImFailure.remote();
        } finally {
            if (pending != null && !pending.isDone()) pending.cancel(true);
        }
    }

    static void validate(String method, URI uri) {
        if (uri == null || !"https".equals(uri.getScheme()) || !"qyapi.weixin.qq.com".equals(uri.getHost())
                || uri.getPort() != -1 || uri.getRawUserInfo() != null || uri.getRawFragment() != null
                || !uri.getRawPath().equals(uri.getPath()) || !uri.normalize().equals(uri)
                || !("GET".equals(method) && READ_PATHS.contains(uri.getPath())
                || "POST".equals(method) && WRITE_PATHS.contains(uri.getPath()))) {
            throw ImFailure.configuration();
        }
    }

    private static final class BoundedBody implements HttpResponse.BodySubscriber<byte[]> {
        private final HttpResponse.BodySubscriber<byte[]> delegate = HttpResponse.BodySubscribers.ofByteArray();
        private Flow.Subscription subscription;
        private long received;
        private boolean finished;

        @Override
        public CompletionStage<byte[]> getBody() { return delegate.getBody(); }

        @Override
        public void onSubscribe(Flow.Subscription incoming) {
            subscription = incoming;
            delegate.onSubscribe(incoming);
        }

        @Override
        public void onNext(List<ByteBuffer> buffers) {
            if (finished) return;
            for (ByteBuffer buffer : buffers) received += buffer.remaining();
            if (received > MAX_RESPONSE_BYTES) {
                finished = true;
                subscription.cancel();
                delegate.onError(new IOException("IM_RESPONSE_TOO_LARGE"));
            } else delegate.onNext(buffers);
        }

        @Override
        public void onError(Throwable failure) {
            if (!finished) {
                finished = true;
                delegate.onError(failure);
            }
        }

        @Override
        public void onComplete() {
            if (!finished) {
                finished = true;
                delegate.onComplete();
            }
        }
    }
}
