package cn.iocoder.yudao.module.callphone.service.settings;

import cn.hutool.json.JSONUtil;
import cn.iocoder.yudao.module.callphone.controller.admin.settings.vo.EntitlementSnapshotRespVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.settings.IntegrationConnectionDO;
import cn.iocoder.yudao.module.callphone.dal.mysql.settings.IntegrationConnectionMapper;
import cn.iocoder.yudao.module.callphone.service.security.PiiCryptoService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.Resource;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * Displays entitlement metadata from the protected Call Phone service.
 * This snapshot is informational only; protected features must validate again
 * at the product service and must never trust a locally editable entitlement.
 */
@Service
public class EntitlementService {

    private static final Set<String> ENTITLEMENT_STATUSES = Set.of("active", "expired", "suspended", "trial");
    private static final String ENTITLEMENT_PATH = "/v1/entitlements/current";

    @Resource private IntegrationConnectionMapper integrationMapper;
    @Resource private PiiCryptoService crypto;
    @Resource private ObjectMapper objectMapper;

    @Value("${CALLPHONE_CORE_ALLOWED_HOSTS:}")
    private String allowedHostsConfig;

    public EntitlementSnapshotRespVO getCurrent() {
        EntitlementSnapshotRespVO snapshot = new EntitlementSnapshotRespVO();
        snapshot.setCheckedAt(OffsetDateTime.now().toString());
        IntegrationConnectionDO connection = integrationMapper.selectByProvider("ai_core");
        if (connection == null || connection.getCredentialCiphertext() == null || connection.getEndpointUrl() == null) {
            snapshot.setState("not_configured");
            snapshot.setMessage("请先在扩展服务配置中配置 Call Phone AI 核心服务。");
            snapshot.setFeatures(List.of());
            return snapshot;
        }

        URI endpoint;
        try {
            endpoint = buildEndpoint(connection.getEndpointUrl());
        } catch (RuntimeException exception) {
            snapshot.setState("not_configured");
            snapshot.setMessage("核心服务地址未通过部署主机白名单校验，请联系管理员检查部署配置。");
            snapshot.setFeatures(List.of());
            return snapshot;
        }

        try {
            Map<String, String> credentials = JSONUtil.toBean(crypto.decrypt(connection.getCredentialCiphertext()),
                    Map.class);
            String apiKey = credentials.get("apiKey");
            if (apiKey == null || apiKey.isBlank()) {
                snapshot.setState("not_configured");
                snapshot.setMessage("核心服务凭据未配置完整。");
                snapshot.setFeatures(List.of());
                return snapshot;
            }

            HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3))
                    .followRedirects(HttpClient.Redirect.NEVER).build();
            HttpRequest request = HttpRequest.newBuilder(endpoint).timeout(Duration.ofSeconds(5))
                    .header("Authorization", "Bearer " + apiKey)
                    .header("Accept", "application/json")
                    .header("User-Agent", "CallPhone-Entitlement/1")
                    .GET().build();
            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) {
                snapshot.setState("unavailable");
                snapshot.setMessage(response.statusCode() == 401 || response.statusCode() == 403
                        ? "核心服务未接受当前授权凭据，请检查扩展服务配置。"
                        : "暂时无法读取授权信息，请稍后重试。");
                snapshot.setFeatures(List.of());
                return snapshot;
            }
            applyResponse(snapshot, objectMapper.readTree(response.body()));
        } catch (Exception exception) {
            snapshot.setState("unavailable");
            snapshot.setMessage("授权服务暂时不可用，请检查网络和服务配置后重试。");
            snapshot.setFeatures(List.of());
        }
        return snapshot;
    }

    private URI buildEndpoint(String endpointUrl) {
        URI base = URI.create(endpointUrl);
        if (!"https".equalsIgnoreCase(base.getScheme()) || base.getHost() == null || base.getUserInfo() != null
                || base.getRawQuery() != null || base.getFragment() != null) {
            throw new IllegalArgumentException("Invalid entitlement endpoint");
        }
        String normalizedHost = base.getHost().toLowerCase(Locale.ROOT);
        List<String> allowedHosts = Arrays.stream(allowedHostsConfig.split(","))
                .map(String::trim).map(host -> host.toLowerCase(Locale.ROOT)).filter(host -> !host.isBlank()).toList();
        if (!allowedHosts.contains(normalizedHost)) throw new IllegalArgumentException("Host is not allowlisted");
        String basePath = base.getPath() == null ? "" : base.getPath().replaceAll("/+$", "");
        return URI.create(base.getScheme() + "://" + base.getRawAuthority() + basePath + ENTITLEMENT_PATH);
    }

    private void applyResponse(EntitlementSnapshotRespVO snapshot, JsonNode root) {
        String status = text(root, "status", 24);
        if (!ENTITLEMENT_STATUSES.contains(status)) throw new IllegalArgumentException("Invalid entitlement status");
        snapshot.setState("available");
        snapshot.setStatus(status);
        snapshot.setPlanCode(text(root, "planCode", 48));
        snapshot.setPlanName(text(root, "planName", 80));
        snapshot.setExpiresAt(isoDate(root, "expiresAt"));
        snapshot.setBillingUrl(allowlistedUrl(text(root, "billingUrl", 512)));
        snapshot.setPairedDeviceCount(nonNegativeInt(root, "pairedDeviceCount"));
        snapshot.setPairedDeviceLimit(nonNegativeInt(root, "pairedDeviceLimit"));
        snapshot.setMessage("授权状态由 Call Phone 核心服务实时返回；客户资料仍保存在本地数据平面。");

        JsonNode features = root.path("features");
        if (!features.isArray() || features.size() > 100) throw new IllegalArgumentException("Invalid entitlement features");
        List<EntitlementSnapshotRespVO.FeatureVO> rows = new ArrayList<>();
        for (JsonNode feature : features) {
            EntitlementSnapshotRespVO.FeatureVO row = new EntitlementSnapshotRespVO.FeatureVO();
            row.setCode(text(feature, "code", 48));
            row.setName(text(feature, "name", 80));
            row.setEnabled(feature.path("enabled").isBoolean() && feature.path("enabled").asBoolean());
            row.setUsed(nonNegativeInt(feature, "used"));
            row.setLimit(nonNegativeInt(feature, "limit"));
            rows.add(row);
        }
        snapshot.setFeatures(rows);
    }

    private String text(JsonNode node, String field, int maxLength) {
        JsonNode value = node.get(field);
        if (value == null || value.isNull()) return null;
        if (!value.isTextual() || value.asText().length() > maxLength) throw new IllegalArgumentException("Invalid field");
        return value.asText();
    }

    private String isoDate(JsonNode node, String field) {
        String value = text(node, field, 40);
        if (value == null || value.isBlank()) return null;
        return OffsetDateTime.parse(value).toString();
    }

    private Integer nonNegativeInt(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || value.isNull()) return null;
        if (!value.canConvertToInt() || value.asInt() < 0) throw new IllegalArgumentException("Invalid count");
        return value.asInt();
    }

    private String allowlistedUrl(String value) {
        if (value == null || value.isBlank()) return null;
        try {
            URI uri = URI.create(value);
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null
                    || uri.getRawQuery() != null || uri.getFragment() != null) return null;
            String host = uri.getHost().toLowerCase(Locale.ROOT);
            boolean allowed = Arrays.stream(allowedHostsConfig.split(",")).map(String::trim)
                    .anyMatch(candidate -> candidate.equalsIgnoreCase(host));
            return allowed ? uri.toString() : null;
        } catch (RuntimeException exception) {
            return null;
        }
    }
}
