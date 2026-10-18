package com.cloudflow.auth.storage;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.http.nio.netty.NettyNioAsyncHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3AsyncClient;
import software.amazon.awssdk.services.s3.model.ListObjectsV2Response;

public class ObjectStorageIntegrationProbe {
    public static void main(String[] arguments) throws Exception {
        if (arguments.length != 2 || !List.of("prepare", "inventory").contains(arguments[1])) {
            throw new IllegalArgumentException("isolated object storage probe arguments required");
        }
        Path directory = Path.of(arguments[0]).toRealPath();
        if (!"batch-g-integration".equals(directory.getParent().getFileName().toString())
                || !directory.getFileName().toString().matches("[a-f0-9]{32}")) {
            throw new IllegalArgumentException("unexpected integration workspace");
        }
        ObjectMapper json = new ObjectMapper();
        JsonNode settings = json.readTree(Files.readString(directory.resolve("private/storage.json")).replace("\uFEFF", ""));
        JsonNode state = json.readTree(Files.readString(directory.resolve("state.json")).replace("\uFEFF", ""));
        URI endpoint = URI.create(settings.path("endpoint").asText());
        if (!"http".equals(endpoint.getScheme()) || !"127.0.0.1".equals(endpoint.getHost())
                || endpoint.getPort() <= 1024 || endpoint.getUserInfo() != null
                || !endpoint.toString().equals(state.path("objectStorage").path("endpoint").asText())) {
            throw new IllegalArgumentException("object storage must use the isolated loopback endpoint");
        }
        String bucket = settings.path("bucket").asText();
        if (!bucket.equals("g-storage-" + directory.getFileName())) throw new IllegalArgumentException("unexpected isolated bucket");
        if (!directory.resolve("minio-data").toRealPath().equals(Path.of(state.path("objectStorage").path("data").asText()).toRealPath())) {
            throw new IllegalArgumentException("object storage data directory mismatch");
        }
        try (S3AsyncClient client = S3AsyncClient.builder().endpointOverride(endpoint).region(Region.US_EAST_1)
                .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create(settings.path("accessKey").asText(), settings.path("secretKey").asText())))
                .forcePathStyle(true).httpClientBuilder(NettyNioAsyncHttpClient.builder().connectionTimeout(Duration.ofSeconds(5)).readTimeout(Duration.ofSeconds(10)))
                .build()) {
            if ("prepare".equals(arguments[1])) client.createBucket(request -> request.bucket(bucket)).join();
            List<Map<String, Object>> objects = new ArrayList<>();
            String continuation = null;
            do {
                String token = continuation;
                ListObjectsV2Response response = client.listObjectsV2(request -> request.bucket(bucket).continuationToken(token)).join();
                response.contents().forEach(object -> objects.add(Map.of("key", object.key(), "size", object.size())));
                continuation = Boolean.TRUE.equals(response.isTruncated()) ? response.nextContinuationToken() : null;
            } while (continuation != null);
            System.out.println("STORAGE_RESULT:" + json.writeValueAsString(Map.of("objects", objects)));
        }
    }
}
