// Menu regrouping changes navigation only; retain bookmarks, query parameters and hashes.
const destinations: Record<string,string> = {
  "/system/dict": "/infra/base/dict",
  "/infra/config": "/infra/base/config",
  "/system/messages/notice": "/operations/messages/notice",
  "/system/oauth2/token": "/infra/authentication/oauth2/token",
  "/infra/monitors/druid": "/operations/monitors/druid",
  "/infra/monitors/admin-server": "/operations/monitors/admin-server",
  "/infra/monitors/redis": "/operations/monitors/redis",
  "/infra/monitors/skywalking": "/operations/monitors/skywalking",
  "/infra/log/api-access-log": "/operations/log/api-access-log",
  "/infra/log": "/operations/log",
  "/infra/log/api-error-log": "/operations/log/api-error-log",
  "/system/messages/sms": "/operations/messages/sms",
  "/system/messages/sms/sms-channel": "/operations/messages/sms/sms-channel",
  "/system/messages/sms/sms-template": "/operations/messages/sms/sms-template",
  "/system/messages/sms/sms-log": "/operations/messages/sms/sms-log",
  "/system/oauth2": "/infra/authentication/oauth2",
  "/system/oauth2/oauth2/application": "/infra/authentication/oauth2/oauth2/application",
  "/system/area": "/infra/base/area",
  "/system/messages/mail": "/operations/messages/mail",
  "/system/messages/mail/mail-account": "/operations/messages/mail/mail-account",
  "/system/messages/mail/mail-template": "/operations/messages/mail/mail-template",
  "/system/messages/mail/mail-log": "/operations/messages/mail/mail-log",
  "/system/messages/notify": "/operations/messages/notify",
  "/system/messages/notify/notify-template": "/operations/messages/notify/notify-template",
  "/system/messages/notify/notify-message": "/operations/messages/notify/notify-message",
  "/system/social": "/infra/authentication/social",
  "/system/social/client": "/infra/authentication/social/client",
  "/system/social/user": "/infra/authentication/social/user",
  "/infra/websocket": "/operations/websocket",
  "/system/messages": "/operations/messages",
  "/infra/monitors": "/operations/monitors",
  "/infra/app-release": "/operations/app-release"
}
export const legacyMenuRedirects: AppRouteRecordRaw[] = Object.entries(destinations).map(
  ([path, destination], index): AppRouteRecordRaw => ({
    name: `ContainerLegacyMenu${index}`,
    path,
    redirect: (to) => ({ path: destination, query: to.query, hash: to.hash }),
    meta: { hidden: true, noTagsView: true }
  })
)
