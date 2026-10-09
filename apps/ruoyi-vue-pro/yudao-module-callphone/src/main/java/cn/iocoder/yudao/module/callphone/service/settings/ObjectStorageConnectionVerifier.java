package cn.iocoder.yudao.module.callphone.service.settings;

import java.net.URI;
import java.time.Duration;
import java.util.Map;
import java.util.Objects;
import org.springframework.stereotype.Component;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.client.config.ClientOverrideConfiguration;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.model.HeadBucketRequest;

/**
 * Performs a signed, read-only check against the configured S3-compatible bucket.
 * The request does not list objects or read/write customer files.
 */
@Component
public class ObjectStorageConnectionVerifier {

    private final S3ClientFactory clientFactory;

    public ObjectStorageConnectionVerifier() {
        this(ObjectStorageConnectionVerifier::createClient);
    }

    ObjectStorageConnectionVerifier(S3ClientFactory clientFactory) {
        this.clientFactory = Objects.requireNonNull(clientFactory);
    }

    public void verify(String endpointUrl, Map<String, String> credentials) {
        String accessKey = credentials.get("accessKey");
        String secretKey = credentials.get("secretKey");
        String bucket = credentials.get("bucket");
        String region = credentials.getOrDefault("region", "us-east-1").trim();
        if (endpointUrl == null || accessKey == null || secretKey == null || bucket == null) {
            throw new IllegalArgumentException("Object storage configuration is incomplete");
        }
        bucket = bucket.trim();

        try (S3Client client = clientFactory.create(URI.create(endpointUrl), region, accessKey, secretKey)) {
            client.headBucket(HeadBucketRequest.builder().bucket(bucket).build());
        }
    }

    private static S3Client createClient(URI endpoint, String region, String accessKey, String secretKey) {
        return S3Client.builder()
                .endpointOverride(endpoint)
                .region(Region.of(region))
                .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create(accessKey, secretKey)))
                .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).build())
                .overrideConfiguration(ClientOverrideConfiguration.builder()
                        .apiCallAttemptTimeout(Duration.ofSeconds(4))
                        .apiCallTimeout(Duration.ofSeconds(8))
                        .build())
                .build();
    }

    @FunctionalInterface
    interface S3ClientFactory {
        S3Client create(URI endpoint, String region, String accessKey, String secretKey);
    }
}
