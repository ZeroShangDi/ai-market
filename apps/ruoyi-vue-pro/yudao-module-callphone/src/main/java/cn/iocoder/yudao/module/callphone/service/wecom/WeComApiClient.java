package cn.iocoder.yudao.module.callphone.service.wecom;

import cn.iocoder.yudao.framework.common.exception.util.ServiceExceptionUtil;
import cn.iocoder.yudao.module.callphone.dal.dataobject.settings.IntegrationConnectionDO;
import cn.iocoder.yudao.module.callphone.enums.ErrorCodeConstants;
import cn.iocoder.yudao.module.callphone.service.security.PiiCryptoService;
import cn.hutool.json.JSONUtil;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.Resource;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

/** Small, fixed-host WeCom client. Never logs request URLs, tokens, or provider bodies. */
@Component
public class WeComApiClient {
    private static final String API = "https://qyapi.weixin.qq.com";
    private final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3))
            .followRedirects(HttpClient.Redirect.NEVER).build();
    @Resource private PiiCryptoService crypto;
    @Resource private ObjectMapper objectMapper;

    public List<FollowUser> getFollowUsers(IntegrationConnectionDO connection) {
        String token = token(connection);
        JsonNode root = get("/cgi-bin/externalcontact/get_follow_user_list?access_token=" + enc(token));
        JsonNode rows = root.path("follow_user");
        if (!rows.isArray()) fail();
        List<FollowUser> result = new ArrayList<>();
        rows.forEach(row -> {
            String id = text(row, "userid");
            if (id != null) result.add(new FollowUser(id, employeeName(connection, token, id)));
        });
        return result;
    }

    /** Verifies credentials and read-only follow-user scope without retaining returned employee IDs. */
    public void verifyReadOnlySyncScope(IntegrationConnectionDO connection) {
        String token = token(connection);
        JsonNode root = get("/cgi-bin/externalcontact/get_follow_user_list?access_token=" + enc(token));
        if (!root.path("follow_user").isArray()) fail();
    }

    private String employeeName(IntegrationConnectionDO connection, String token, String userId) {
        try {
            JsonNode root = get("/cgi-bin/user/get?access_token=" + enc(token) + "&userid=" + enc(userId));
            String name = text(root, "name");
            return name == null || name.isBlank() ? userId : name;
        } catch (RuntimeException exception) {
            // Contact-follow scope may be granted without the enterprise directory scope.
            return userId;
        }
    }

    public List<String> getContactIds(IntegrationConnectionDO connection, String userId) {
        String token = token(connection);
        JsonNode root = get("/cgi-bin/externalcontact/list?access_token=" + enc(token) + "&userid=" + enc(userId));
        JsonNode rows = root.path("external_userid");
        if (!rows.isArray()) fail();
        List<String> ids = new ArrayList<>();
        rows.forEach(value -> { if (value.isTextual()) ids.add(value.asText()); });
        return ids;
    }

    public String getFollowUserName(IntegrationConnectionDO connection, String userId) {
        return employeeName(connection, token(connection), userId);
    }

    public JsonNode getContact(IntegrationConnectionDO connection, String externalUserId) {
        String token = token(connection);
        JsonNode root = get("/cgi-bin/externalcontact/get?access_token=" + enc(token) + "&external_userid=" + enc(externalUserId));
        JsonNode contact = root.get("external_contact");
        if (contact == null || !contact.isObject()) fail();
        return root;
    }

    public List<String> getGroupChatIds(IntegrationConnectionDO connection, String ownerUserId) {
        String token = token(connection);
        List<String> result = new ArrayList<>();
        String cursor = null;
        for (int page = 0; page < 100; page++) {
            Map<String, Object> body = new java.util.HashMap<>();
            body.put("status_filter", 0);
            body.put("owner_filter", Map.of("userid_list", List.of(ownerUserId)));
            body.put("limit", 1000);
            if (cursor != null && !cursor.isBlank()) body.put("cursor", cursor);
            JsonNode root = post("/cgi-bin/externalcontact/groupchat/list?access_token=" + enc(token), body);
            JsonNode rows = root.path("group_chat");
            if (rows.isArray()) rows.forEach(row -> {
                String id = text(row, "chat_id");
                if (id != null) result.add(id);
            });
            cursor = text(root, "next_cursor");
            if (cursor == null || cursor.isBlank()) return result;
        }
        fail();
        return List.of();
    }

    public JsonNode getGroupChat(IntegrationConnectionDO connection, String chatId) {
        String token = token(connection);
        JsonNode root = post("/cgi-bin/externalcontact/groupchat/get?access_token=" + enc(token),
                Map.of("chat_id", chatId, "need_name", 1));
        if (root.path("group_chat").isMissingNode()) fail();
        return root.path("group_chat");
    }

    private String token(IntegrationConnectionDO connection) {
        if (connection == null || connection.getCredentialCiphertext() == null || !"wecom".equals(connection.getProvider())) {
            throw ServiceExceptionUtil.exception(ErrorCodeConstants.WECOM_NOT_CONFIGURED);
        }
        try {
            @SuppressWarnings("unchecked") Map<String, String> credentials = JSONUtil.toBean(crypto.decrypt(connection.getCredentialCiphertext()), Map.class);
            String corpId = credentials.get("corpId");
            String secret = credentials.get("secret");
            if (corpId == null || secret == null) throw new IllegalArgumentException();
            JsonNode root = get("/cgi-bin/gettoken?corpid=" + enc(corpId) + "&corpsecret=" + enc(secret));
            String value = text(root, "access_token");
            if (value == null || value.length() > 4096) fail();
            return value;
        } catch (RuntimeException exception) {
            if (exception.getMessage() != null && exception.getMessage().contains("WECOM")) throw exception;
            throw ServiceExceptionUtil.exception(ErrorCodeConstants.WECOM_UPSTREAM_UNAVAILABLE);
        }
    }

    private JsonNode get(String path) {
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(API + path)).timeout(Duration.ofSeconds(8))
                    .header("Accept", "application/json").header("User-Agent", "CallPhone/1.0")
                    .GET().build();
            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200 || response.body().length() > 2_000_000) fail();
            JsonNode root = objectMapper.readTree(response.body());
            if (!root.path("errcode").isMissingNode() && root.path("errcode").asInt(-1) != 0) fail();
            return root;
        } catch (Exception exception) {
            throw ServiceExceptionUtil.exception(ErrorCodeConstants.WECOM_UPSTREAM_UNAVAILABLE);
        }
    }

    private JsonNode post(String path, Object payload) {
        try {
            String body = objectMapper.writeValueAsString(payload);
            HttpRequest request = HttpRequest.newBuilder(URI.create(API + path)).timeout(Duration.ofSeconds(8))
                    .header("Accept", "application/json").header("Content-Type", "application/json")
                    .header("User-Agent", "CallPhone/1.0")
                    .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8)).build();
            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200 || response.body().length() > 2_000_000) fail();
            JsonNode root = objectMapper.readTree(response.body());
            if (!root.path("errcode").isMissingNode() && root.path("errcode").asInt(-1) != 0) fail();
            return root;
        } catch (Exception exception) {
            throw ServiceExceptionUtil.exception(ErrorCodeConstants.WECOM_UPSTREAM_UNAVAILABLE);
        }
    }

    private String text(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value != null && value.isTextual() ? value.asText() : null;
    }
    private String enc(String value) { return URLEncoder.encode(value, StandardCharsets.UTF_8); }
    private void fail() { throw ServiceExceptionUtil.exception(ErrorCodeConstants.WECOM_UPSTREAM_UNAVAILABLE); }
    public record FollowUser(String userId, String name) {}
}
