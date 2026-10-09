package cn.iocoder.yudao.module.callphone.util;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CallPhoneBackupSchemaCompatibilityTest {

    private static final List<String> V43_COLUMNS = List.of("id", "tenant_id", "device_id", "device_event_id",
            "event_type", "dispatch_id", "call_record_id", "creator", "create_time", "updater", "update_time", "deleted");
    private static final List<String> V44_COLUMNS = List.of("id", "tenant_id", "device_id", "device_event_id",
            "event_type", "request_fingerprint", "dispatch_id", "call_record_id", "creator", "create_time",
            "updater", "update_time", "deleted");
    private static final List<String> V53_ARCHIVE_AUDIT_COLUMNS = List.of("id", "tenant_id", "message_id",
            "actor_id", "purpose_ciphertext", "creator", "create_time", "updater", "update_time", "deleted");

    @Test
    void acceptsExactCurrentSchema() {
        assertTrue(CallPhoneBackupSchemaCompatibility.hasCompatibleColumns(44, "cp_mobile_call_event",
                V44_COLUMNS, V44_COLUMNS));
    }

    @Test
    void acceptsV43MobileEventWithoutNullableV44Fingerprint() {
        assertTrue(CallPhoneBackupSchemaCompatibility.hasCompatibleColumns(43, "cp_mobile_call_event",
                V44_COLUMNS, V43_COLUMNS));
    }

    @Test
    void rejectsUnrelatedOrUnexpectedSchemaDifferences() {
        assertFalse(CallPhoneBackupSchemaCompatibility.hasCompatibleColumns(42, "cp_mobile_call_event",
                V44_COLUMNS, V43_COLUMNS));
        assertFalse(CallPhoneBackupSchemaCompatibility.hasCompatibleColumns(43, "cp_call_record",
                V44_COLUMNS, V43_COLUMNS));
        assertFalse(CallPhoneBackupSchemaCompatibility.hasCompatibleColumns(43, "cp_mobile_call_event",
                V44_COLUMNS, List.of("id", "tenant_id", "device_id")));
    }

    @Test
    void acceptsV47BackupWithoutNewRecordingAuditTable() {
        Set<String> current = Set.of("cp_call_record", "cp_call_recording_asset", "cp_call_recording_access_audit",
                "cp_lead_assignment_auto_config", "cp_customer_owner_change");
        Set<String> archived = Set.of("cp_call_record", "cp_call_recording_asset");
        assertTrue(CallPhoneBackupSchemaCompatibility.hasCompatibleTables(47, current, archived));
        assertFalse(CallPhoneBackupSchemaCompatibility.hasCompatibleTables(47, current,
                Set.of("cp_call_record", "cp_lead_assignment_auto_config")));
    }

    @Test
    void acceptsV48BackupWithoutNewLeadAutoAssignmentConfig() {
        Set<String> current = Set.of("cp_call_record", "cp_lead_assignment_auto_config", "cp_customer_owner_change");
        assertTrue(CallPhoneBackupSchemaCompatibility.hasCompatibleTables(48, current,
                Set.of("cp_call_record")));
        assertFalse(CallPhoneBackupSchemaCompatibility.hasCompatibleTables(48, current,
                Set.of("cp_call_record", "cp_lead_assignment_auto_config", "cp_unexpected")));
    }

    @Test
    void acceptsV49AutoConfigWithoutTimeoutRecycleColumns() {
        List<String> current = List.of("id", "tenant_id", "rule_id", "version", "recycle_enabled",
                "recycle_after_days", "creator", "create_time", "updater", "update_time", "deleted");
        List<String> archived = List.of("id", "tenant_id", "rule_id", "version", "creator", "create_time",
                "updater", "update_time", "deleted");
        assertTrue(CallPhoneBackupSchemaCompatibility.hasCompatibleColumns(49,
                "cp_lead_assignment_auto_config", current, archived));
        assertFalse(CallPhoneBackupSchemaCompatibility.hasCompatibleColumns(49,
                "cp_lead_assignment_auto_config", current, List.of("id", "tenant_id", "rule_id")));
    }

    @Test
    void acceptsV50ToV53ArchiveAuditWithoutActorType() {
        List<String> current = List.of("id", "tenant_id", "message_id", "actor_id", "actor_type",
                "purpose_ciphertext", "creator", "create_time", "updater", "update_time", "deleted");
        assertTrue(CallPhoneBackupSchemaCompatibility.hasCompatibleColumns(50,
                "cp_wecom_archive_access_audit", current, V53_ARCHIVE_AUDIT_COLUMNS));
        assertTrue(CallPhoneBackupSchemaCompatibility.hasCompatibleColumns(53,
                "cp_wecom_archive_access_audit", current, V53_ARCHIVE_AUDIT_COLUMNS));
        assertFalse(CallPhoneBackupSchemaCompatibility.hasCompatibleColumns(49,
                "cp_wecom_archive_access_audit", current, V53_ARCHIVE_AUDIT_COLUMNS));
        assertFalse(CallPhoneBackupSchemaCompatibility.hasCompatibleColumns(53,
                "cp_wecom_archive_access_audit", current,
                List.of("id", "tenant_id", "message_id", "actor_id")));
    }

    @Test
    void acceptsV49ToV54BackupWithoutCustomerOwnerChangeTable() {
        Set<String> current = Set.of("cp_customer", "cp_lead", "cp_customer_owner_change");
        Set<String> archived = Set.of("cp_customer", "cp_lead");
        assertTrue(CallPhoneBackupSchemaCompatibility.hasCompatibleTables(49, current, archived));
        assertTrue(CallPhoneBackupSchemaCompatibility.hasCompatibleTables(54, current, archived));
        assertFalse(CallPhoneBackupSchemaCompatibility.hasCompatibleTables(48, current, archived));
        assertFalse(CallPhoneBackupSchemaCompatibility.hasCompatibleTables(54, current,
                Set.of("cp_customer")));
    }

    @Test
    void acceptsV46BackupWithoutRecordingAndAuditTables() {
        Set<String> current = Set.of("cp_call_record", "cp_call_recording_asset", "cp_call_recording_access_audit",
                "cp_lead_assignment_auto_config", "cp_customer_owner_change");
        Set<String> archived = Set.of("cp_call_record");
        assertTrue(CallPhoneBackupSchemaCompatibility.hasCompatibleTables(46, current, archived));
        assertFalse(CallPhoneBackupSchemaCompatibility.hasCompatibleTables(45, current, archived));
    }

    @Test
    void requiresEveryBackupTableExactlyOnce() {
        Set<String> expected = Set.of("cp_customer", "cp_lead");

        assertTrue(CallPhoneBackupArchiveIntegrity.hasCompleteTableEntries(expected,
                List.of("tables/cp_customer.jsonl", "tables/cp_lead.jsonl")));
        assertFalse(CallPhoneBackupArchiveIntegrity.hasCompleteTableEntries(expected,
                List.of("tables/cp_customer.jsonl")));
        assertFalse(CallPhoneBackupArchiveIntegrity.hasCompleteTableEntries(expected,
                List.of("tables/cp_customer.jsonl", "tables/cp_customer.jsonl")));
        assertFalse(CallPhoneBackupArchiveIntegrity.hasCompleteTableEntries(expected,
                List.of("tables/cp_customer.jsonl", "tables/cp_system_user.jsonl")));
        assertFalse(CallPhoneBackupArchiveIntegrity.hasCompleteTableEntries(expected,
                List.of("tables/../cp_lead.jsonl", "tables/cp_customer.jsonl")));
    }

    @Test
    void requiresManifestRowCountToMatchRestoredRows() {
        assertTrue(CallPhoneBackupArchiveIntegrity.hasExpectedRowCount(10, 10));
        assertFalse(CallPhoneBackupArchiveIntegrity.hasExpectedRowCount(10, 9));
        assertFalse(CallPhoneBackupArchiveIntegrity.hasExpectedRowCount(-1, 0));
    }
}
