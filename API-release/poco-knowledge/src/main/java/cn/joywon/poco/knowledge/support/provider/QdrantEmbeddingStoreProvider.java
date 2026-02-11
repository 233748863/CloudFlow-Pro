package cn.joywon.poco.knowledge.support.provider;

import dev.langchain4j.store.embedding.qdrant.QdrantEmbeddingStore;
import io.qdrant.client.QdrantClient;
import io.qdrant.client.grpc.Points;
import lombok.SneakyThrows;
import org.jetbrains.annotations.Nullable;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

import static io.qdrant.client.PointIdFactory.id;

/**
 * 扩展原生的 qdrant
 *
 * @author poco
 * @date 2025/2/22
 */
public class QdrantEmbeddingStoreProvider extends QdrantEmbeddingStore {

	private QdrantClient qdrantClient;

	private String collectionName;

	/**
	 * @param collectionName The name of the Qdrant collection.
	 * @param host The host of the Qdrant instance.
	 * @param port The GRPC port of the Qdrant instance.
	 * @param useTls Whether to use TLS(HTTPS).
	 * @param payloadTextKey The field name of the text segment in the Qdrant payload.
	 * @param apiKey The Qdrant API key to authenticate with.
	 */
	public QdrantEmbeddingStoreProvider(String collectionName, String host, int port, boolean useTls,
			String payloadTextKey, @Nullable String apiKey) {
		super(collectionName, host, port, useTls, payloadTextKey, apiKey);
	}

	/**
	 * @param client A Qdrant client instance.
	 * @param collectionName The name of the Qdrant collection.
	 * @param payloadTextKey The field name of the text segment in the Qdrant payload.
	 */
	public QdrantEmbeddingStoreProvider(QdrantClient client, String collectionName, String payloadTextKey) {
		super(client, collectionName, payloadTextKey);
		this.qdrantClient = client;
		this.collectionName = collectionName;
	}

	@SneakyThrows
	@Override
	public void removeAll(Collection<String> idList) {
		List<Points.PointId> ids = idList.stream().map(id -> id(UUID.fromString(id))).toList();
		this.qdrantClient.deleteAsync(collectionName, ids).get();
	}

}
