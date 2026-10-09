package cn.iocoder.yudao.module.callphone.service.settings;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.lang.reflect.Proxy;
import java.net.URI;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.HeadBucketRequest;
import software.amazon.awssdk.services.s3.model.HeadBucketResponse;
import software.amazon.awssdk.services.s3.model.S3Exception;

class ObjectStorageConnectionVerifierTest {

    @Test
    void sendsReadOnlyHeadBucketRequestWithConfiguredValues() {
        AtomicReference<HeadBucketRequest> headRequest = new AtomicReference<>();
        AtomicReference<ConnectionSettings> settings = new AtomicReference<>();
        S3Client client = fakeClient(headRequest, null);
        ObjectStorageConnectionVerifier verifier = new ObjectStorageConnectionVerifier((endpoint, region, accessKey, secretKey) -> {
            settings.set(new ConnectionSettings(endpoint, region, accessKey, secretKey));
            return client;
        });

        verifier.verify("https://s3.us-west-2.example.test", Map.of(
                "accessKey", "test-access", "secretKey", "test-secret", "bucket", "private-files", "region", "us-west-2"));

        assertEquals(new ConnectionSettings(URI.create("https://s3.us-west-2.example.test"), "us-west-2", "test-access", "test-secret"), settings.get());
        assertEquals("private-files", headRequest.get().bucket());
    }

    @Test
    void defaultsRegionForLegacyCredentialsAndPropagatesBucketFailure() {
        AtomicReference<HeadBucketRequest> headRequest = new AtomicReference<>();
        S3Client client = fakeClient(headRequest, S3Exception.builder().statusCode(403).build());
        AtomicReference<String> region = new AtomicReference<>();
        ObjectStorageConnectionVerifier verifier = new ObjectStorageConnectionVerifier((endpoint, configuredRegion, accessKey, secretKey) -> {
            region.set(configuredRegion);
            return client;
        });

        assertThrows(S3Exception.class, () -> verifier.verify("https://storage.example.test", Map.of(
                "accessKey", "test-access", "secretKey", "test-secret", "bucket", "private-files")));

        assertEquals("us-east-1", region.get());
        assertEquals("private-files", headRequest.get().bucket());
    }

    private S3Client fakeClient(AtomicReference<HeadBucketRequest> headRequest, RuntimeException failure) {
        return (S3Client) Proxy.newProxyInstance(S3Client.class.getClassLoader(), new Class<?>[] {S3Client.class},
                (proxy, method, args) -> {
                    if ("headBucket".equals(method.getName()) && args != null && args[0] instanceof HeadBucketRequest request) {
                        headRequest.set(request);
                        if (failure != null) throw failure;
                        return HeadBucketResponse.builder().build();
                    }
                    if ("close".equals(method.getName())) return null;
                    throw new AssertionError("Unexpected S3 operation: " + method.getName());
                });
    }

    private record ConnectionSettings(URI endpoint, String region, String accessKey, String secretKey) {}
}
