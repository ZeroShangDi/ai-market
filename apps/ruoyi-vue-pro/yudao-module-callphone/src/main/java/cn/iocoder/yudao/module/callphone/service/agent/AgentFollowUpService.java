package cn.iocoder.yudao.module.callphone.service.agent;

import cn.hutool.core.util.IdUtil;
import cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX;
import cn.iocoder.yudao.framework.security.core.service.SecurityFrameworkService;
import cn.iocoder.yudao.module.callphone.dal.dataobject.agent.AgentFollowUpReceiptDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CustomerDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.FollowUpTaskDO;
import cn.iocoder.yudao.module.callphone.dal.mysql.agent.AgentFollowUpReceiptMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.CustomerMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.FollowUpTaskMapper;
import cn.iocoder.yudao.module.callphone.service.security.PiiCryptoService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.annotation.Resource;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;

/** The model proposes. An authenticated user and business transaction perform the write. */
@Service
public class AgentFollowUpService {
    @Resource private CustomerMapper customerMapper;
    @Resource private FollowUpTaskMapper followUpTaskMapper;
    @Resource private AgentFollowUpReceiptMapper receiptMapper;
    @Resource private PiiCryptoService crypto;
    @Resource private SecurityFrameworkService security;
    @Resource private TransactionTemplate transactions;
    private final ObjectMapper json = new ObjectMapper();

    public ObjectNode customerSnapshot(Long id, AgentActor actor) {
        CustomerDO customer = requireCustomer(id, actor);
        ObjectNode snapshot = json.createObjectNode();
        snapshot.put("id", customer.getId().toString());
        snapshot.put("name", crypto.decrypt(customer.getNameCiphertext()));
        snapshot.put("stage", customer.getStage());
        return snapshot;
    }

    public CustomerDO requireCustomer(Long id, AgentActor actor) {
        CustomerDO customer = customerMapper.selectOne(new LambdaQueryWrapperX<CustomerDO>()
                .eq(CustomerDO::getId, id).eq(CustomerDO::getTenantId, actor.tenantId())
                .eq(CustomerDO::getOwnerUserId, actor.userId()).eq(CustomerDO::getStatus, "active"));
        if (customer == null || !actor.tenantId().equals(customer.getTenantId())
                || !actor.userId().equals(customer.getOwnerUserId()) || !"active".equals(customer.getStatus())) {
            throw new AgentTaskRelay.Failure(403, "FORBIDDEN", "当前账号无权使用该客户");
        }
        return customer;
    }

    public Long confirm(String taskId, JsonNode task, AgentActor actor) {
        if (!security.hasPermission("callphone:followup:save")) {
            throw new AgentTaskRelay.Failure(403, "FORBIDDEN", "当前账号无权创建跟进事项");
        }
        if (!taskId.equals(task.path("id").asText())) throw invalidTask();
        Long customerId = numericId(task.path("customer_id"));
        // A business commit remains authoritative even if cancellation raced with its delivery.
        AgentFollowUpReceiptDO existing = receiptMapper.find(taskId, actor.tenantId(), actor.userId());
        if (existing != null) return existingReceipt(existing, customerId);
        requireCustomer(customerId, actor);
        String status = task.path("status").asText();
        if (!"awaiting_confirmation".equals(status) && !"completed".equals(status)) throw invalidTask();
        // A completed upstream task without a local receipt can never authorize a new business write.
        if (!"awaiting_confirmation".equals(status)) throw invalidTask();
        JsonNode proposal = task.path("proposal");
        String title = text(proposal.path("title"), 120, true);
        String content = text(proposal.path("content"), 2000, false);
        LocalDateTime dueAt;
        try { dueAt = OffsetDateTime.parse(text(proposal.path("due_at"), 64, true))
                .withOffsetSameInstant(ZoneOffset.UTC).toLocalDateTime(); }
        catch (java.time.DateTimeException e) { throw invalidTask(); }
        String encryptedTitle = crypto.encrypt(title.trim());
        String encryptedContent = crypto.encrypt(content);
        // Existing ciphertext columns bound bytes after UTF-8, nonce/tag and Base64 expansion.
        if (encryptedTitle == null || encryptedTitle.length() > 1024
                || (encryptedContent != null && encryptedContent.length() > 4096)) throw invalidTask();
        try {
            return transactions.execute(transaction -> {
                requireCustomer(customerId, actor);
                AgentFollowUpReceiptDO retryReceipt = receiptMapper.find(taskId, actor.tenantId(), actor.userId());
                if (retryReceipt != null) return existingReceipt(retryReceipt, customerId);
                Long followUpId = IdUtil.getSnowflake().nextId();
                AgentFollowUpReceiptDO receipt = new AgentFollowUpReceiptDO();
                receipt.setId(IdUtil.getSnowflake().nextId()); receipt.setTenantId(actor.tenantId());
                receipt.setAgentTaskId(taskId); receipt.setOwnerUserId(actor.userId());
                receipt.setCustomerId(customerId); receipt.setFollowUpTaskId(followUpId);
                // Unique insertion serializes concurrent confirmations. A failure rolls back both rows.
                receiptMapper.insert(receipt);
                FollowUpTaskDO followUp = new FollowUpTaskDO();
                followUp.setId(followUpId); followUp.setTenantId(actor.tenantId());
                followUp.setCustomerId(customerId); followUp.setOwnerUserId(actor.userId());
                followUp.setTitleCiphertext(encryptedTitle);
                followUp.setContentCiphertext(encryptedContent);
                followUp.setDueAt(dueAt); followUp.setStatus("pending");
                followUpTaskMapper.insert(followUp);
                return followUpId;
            });
        } catch (DuplicateKeyException raced) {
            AgentFollowUpReceiptDO winner = receiptMapper.find(taskId, actor.tenantId(), actor.userId());
            if (winner == null) throw raced;
            return existingReceipt(winner, customerId);
        }
    }

    /** Reading an owned receipt can only reconcile a prior write, never authorize a fresh write. */
    public Long committedReceipt(String taskId, JsonNode task, AgentActor actor) {
        if (!taskId.equals(task.path("id").asText())) throw invalidTask();
        AgentFollowUpReceiptDO receipt = receiptMapper.find(taskId, actor.tenantId(), actor.userId());
        return receipt == null ? null : existingReceipt(receipt, numericId(task.path("customer_id")));
    }

    private Long existingReceipt(AgentFollowUpReceiptDO receipt, Long customerId) {
        if (!customerId.equals(receipt.getCustomerId())) throw invalidTask();
        return receipt.getFollowUpTaskId();
    }

    public static Long numericId(JsonNode value) {
        String raw = value.isTextual() ? value.textValue() : "";
        if (!raw.matches("[1-9][0-9]{0,18}")) throw new AgentTaskRelay.Failure(400, "VALIDATION_ERROR", "业务标识无效");
        try { return Long.parseLong(raw); }
        catch (NumberFormatException e) { throw new AgentTaskRelay.Failure(400, "VALIDATION_ERROR", "业务标识无效"); }
    }

    private static String text(JsonNode value, int limit, boolean required) {
        if (!required && (value.isMissingNode() || value.isNull())) return null;
        if (!value.isTextual() || value.textValue().length() > limit || (required && value.textValue().isBlank())) throw invalidTask();
        return value.textValue();
    }

    private static AgentTaskRelay.Failure invalidTask() {
        return new AgentTaskRelay.Failure(409, "TASK_CONFLICT", "任务尚无可确认的跟进建议，请刷新状态");
    }
}
