package cn.iocoder.yudao.module.callphone.framework.datapermission;

import java.util.Set;

/** Resolved Yudao role data scope for rows owned by Call Phone users. */
public record CallPhoneOwnerScope(boolean all, Set<Long> ownerUserIds) {

    public CallPhoneOwnerScope {
        ownerUserIds = ownerUserIds == null ? Set.of() : Set.copyOf(ownerUserIds);
    }

    public boolean allows(Long ownerUserId) {
        return all || (ownerUserId != null && ownerUserIds.contains(ownerUserId));
    }
}
