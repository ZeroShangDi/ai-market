-- Optional payment schema adapted from upstream DOs and test DDL; no merchant data.
CREATE TABLE IF NOT EXISTS `pay_app` (
    `id` bigint NOT NULL AUTO_INCREMENT,
    `app_key`              varchar(64)   NOT NULL,
    `name`              varchar(64)   NOT NULL,
    `status`            tinyint       NOT NULL,
    `remark`            varchar(255)           DEFAULT NULL,
    `order_notify_url`    varchar(1024) NOT NULL,
    `refund_notify_url` varchar(1024) NOT NULL,
    `creator`           varchar(64)            DEFAULT '',
    `create_time`       datetime      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updater`           varchar(64)            DEFAULT '',
    `update_time`       datetime      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `deleted`           bit(1)        NOT NULL DEFAULT FALSE,
    `transfer_notify_url` text NULL,
    `tenant_id` bigint NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`)
) COMMENT = '支付应用';

CREATE TABLE IF NOT EXISTS `pay_channel` (
    `id` bigint NOT NULL AUTO_INCREMENT,
    `code`        varchar(32)    NOT NULL,
    `status`      tinyint(4)     NOT NULL,
    `remark`      varchar(255)            DEFAULT NULL,
    `fee_rate`    double         NOT NULL DEFAULT 0,
    `app_id`      bigint(20)     NOT NULL,
    `config`      varchar(10240) NOT NULL,
    `creator`     varchar(64)    NULL     DEFAULT '',
    `create_time` datetime       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updater`     varchar(64)    NULL     DEFAULT '',
    `update_time` datetime       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `deleted`     bit(1)         NOT NULL DEFAULT FALSE,
    `tenant_id` bigint not null default  '0',
    PRIMARY KEY (`id`)
) COMMENT = '支付渠道';

CREATE TABLE IF NOT EXISTS `pay_order` (
    `id` bigint NOT NULL AUTO_INCREMENT,
    `app_id`               bigint(20)    NOT NULL,
    `channel_id`           bigint(20)             DEFAULT NULL,
    `channel_code`         varchar(32)            DEFAULT NULL,
    `merchant_order_id`    varchar(64)   NOT NULL,
    `subject`              varchar(32)   NOT NULL,
    `body`                 varchar(128)  NOT NULL,
    `notify_url`           varchar(1024) NOT NULL,
    `price`                bigint(20)    NOT NULL,
    `channel_fee_rate`     double                 DEFAULT 0,
    `channel_fee_price`    bigint(20)             DEFAULT 0,
    `status`               tinyint(4)    NOT NULL,
    `user_ip`              varchar(50)   NOT NULL,
    `user_id`              bigint(20)             DEFAULT NULL,
    `user_type`            tinyint(4)             DEFAULT NULL,
    `expire_time`          timestamp   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `success_time`         datetime(0)            DEFAULT CURRENT_TIMESTAMP,
    `notify_time`          datetime(0)            DEFAULT CURRENT_TIMESTAMP,
    `extension_id` bigint(20)             DEFAULT NULL,
    `no`                   varchar(64)   NULL,
    `refund_price`         bigint(20)    NOT NULL,
    `channel_user_id`      varchar(255)           DEFAULT NULL,
    `channel_order_no`     varchar(64)            DEFAULT NULL,
    `creator`              varchar(64)            DEFAULT '',
    `create_time`          datetime(0)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updater`              varchar(64)            DEFAULT '',
    `update_time`          datetime(0)   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `deleted`              bit(1)        NOT NULL DEFAULT FALSE,
    `tenant_id` bigint NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`)
) COMMENT = '支付订单';

CREATE TABLE IF NOT EXISTS `pay_order_extension` (
    `id` bigint NOT NULL AUTO_INCREMENT,
    `no`           varchar(64)         NOT NULL,
    `order_id`           bigint(20)    NOT NULL,
    `channel_id`         bigint(20)    NOT NULL,
    `channel_code`       varchar(32)   NOT NULL,
    `user_ip`            varchar(50)   NULL     DEFAULT NULL,
    `status`             tinyint(4)    NOT NULL,
    `channel_extras`     varchar(1024) NULL     DEFAULT NULL,
    `channel_error_code`  varchar(64)  NULL,
    `channel_error_msg` varchar(64)    NULL,
    `channel_notify_data` varchar(1024)  NULL,
    `creator`            varchar(64)   NULL     DEFAULT '',
    `create_time`        datetime(0)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updater`            varchar(64)   NULL     DEFAULT '',
    `update_time`        datetime(0)   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `deleted`            bit(1)        NOT NULL DEFAULT FALSE,
    `tenant_id` bigint NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`)
) COMMENT = '支付订单拓展';

CREATE TABLE IF NOT EXISTS `pay_refund` (
    `id` bigint NOT NULL AUTO_INCREMENT,
    `no`           varchar(64)         NOT NULL,
    `app_id`             bigint(20)    NOT NULL,
    `channel_id`         bigint(20)    NOT NULL,
    `channel_code`       varchar(32)   NOT NULL,
    `order_id`           bigint(20)    NOT NULL,
    `order_no`           varchar(64)    NOT NULL,
    `merchant_order_id`  varchar(64)   NOT NULL,
    `merchant_refund_id` varchar(64)   NOT NULL,
    `notify_url`         varchar(1024) NOT NULL,
    `status`             tinyint(4)    NOT NULL,
    `pay_price`         bigint(20)    NOT NULL,
    `refund_price`      bigint(20)    NOT NULL,
    `reason`             varchar(256)  NOT NULL,
    `user_ip`            varchar(50)   NULL     DEFAULT NULL,
    `user_id`            bigint(20)    NULL     DEFAULT NULL,
    `user_type`          tinyint(4)    NULL     DEFAULT NULL,
    `channel_order_no`   varchar(64)   NOT NULL,
    `channel_refund_no`  varchar(64)   NULL     DEFAULT NULL,
    `success_time`       datetime(0)   NULL     DEFAULT NULL,
    `channel_error_code` varchar(128)  NULL     DEFAULT NULL,
    `channel_error_msg`  varchar(256)  NULL     DEFAULT NULL,
    `channel_notify_data` varchar(1024)  NULL,
    `creator`            varchar(64)   NULL     DEFAULT '',
    `create_time`        datetime(0)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updater`            varchar(64)   NULL     DEFAULT '',
    `update_time`        datetime(0)   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `deleted`            bit(1)        NOT NULL DEFAULT FALSE,
    `tenant_id` bigint NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`)
) COMMENT = '退款订单';

CREATE TABLE IF NOT EXISTS `pay_notify_task` (
    `id` bigint NOT NULL AUTO_INCREMENT,
    `app_id`             bigint(20)    NOT NULL,
    `type`               tinyint(4)    NOT NULL,
    `data_id`           bigint(20)    NOT NULL,
    `merchant_order_id`           varchar(64)    NOT NULL,
    `status`             tinyint(4)    NOT NULL,
    `next_notify_time`       datetime(0)   NULL     DEFAULT NULL,
    `last_execute_time`       datetime(0)   NULL     DEFAULT NULL,
    `notify_times`         int    NOT NULL,
    `max_notify_times`         int    NOT NULL,
    `notify_url`         varchar(1024) NOT NULL,
    `creator`            varchar(64)   NULL     DEFAULT '',
    `create_time`        datetime(0)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updater`            varchar(64)   NULL     DEFAULT '',
    `update_time`        datetime(0)   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `deleted`            bit(1)        NOT NULL DEFAULT FALSE,
    `tenant_id`           bigint(20)    NOT NULL DEFAULT 0,
    `merchant_refund_id` text NULL,
    `merchant_transfer_id` text NULL,
    PRIMARY KEY (`id`)
) COMMENT = '支付通知任务';

CREATE TABLE IF NOT EXISTS `pay_notify_log` (
    `id` bigint NOT NULL AUTO_INCREMENT,
    `task_id`             bigint(20)    NOT NULL,
    `notify_times`         int    NOT NULL,
    `response`         varchar(1024) NOT NULL,
    `status`             tinyint(4)    NOT NULL,
    `creator`            varchar(64)   NULL     DEFAULT '',
    `create_time`        datetime(0)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updater`            varchar(64)   NULL     DEFAULT '',
    `update_time`        datetime(0)   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `deleted`            bit(1)        NOT NULL DEFAULT FALSE,
    `tenant_id` bigint NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`)
) COMMENT = '支付通知日志';

CREATE TABLE IF NOT EXISTS `pay_transfer` (
    `id` bigint NOT NULL AUTO_INCREMENT,
    `no`                   varchar(64)   NOT NULL,
    `app_id`               bigint(20)    NOT NULL,
    `channel_id`           bigint(20)    NOT NULL,
    `channel_code`         varchar(32)   NOT NULL,
    `user_id`              bigint(20)    NULL     DEFAULT NULL,
    `user_type`            tinyint(4)    NULL     DEFAULT NULL,
    `merchant_transfer_id` varchar(64)   NOT NULL,
    `price`                bigint(20)    NOT NULL,
    `subject`              varchar(256)  NOT NULL,
    `user_account`         varchar(256)  NOT NULL,
    `user_name`            varchar(64)   NULL     DEFAULT NULL,
    `status`               tinyint(4)    NOT NULL,
    `notify_url`           varchar(1024) NULL     DEFAULT NULL,
    `user_ip`              varchar(50)   NULL     DEFAULT NULL,
    `channel_transfer_no`  varchar(64)   NULL     DEFAULT NULL,
    `success_time`         datetime(0)   NULL     DEFAULT NULL,
    `channel_error_code`   varchar(128)  NULL     DEFAULT NULL,
    `channel_error_msg`    varchar(256)  NULL     DEFAULT NULL,
    `channel_notify_data`  varchar(1024) NULL     DEFAULT NULL,
    `channel_extras`       varchar(1024) NULL     DEFAULT NULL,
    `channel_package_info` varchar(1024) NULL     DEFAULT NULL,
    `creator`              varchar(64)   NULL     DEFAULT '',
    `create_time`          datetime(0)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updater`              varchar(64)   NULL     DEFAULT '',
    `update_time`          datetime(0)   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `deleted`              bit(1)        NOT NULL DEFAULT FALSE,
    PRIMARY KEY (`id`)
) COMMENT = '转账单';

-- Optional payment schema and management metadata; no merchant credentials or financial data.
INSERT IGNORE INTO `system_dict_data` (`id`, `sort`, `label`, `value`, `dict_type`, `status`, `color_type`, `css_class`, `remark`, `creator`, `create_time`, `updater`, `update_time`, `deleted`) VALUES (66, 0, '微信 Wap 网站支付', 'wx_wap', 'pay_channel_code', 0, 'success', '', '微信 Wap 网站支付', '1', '2023-07-19 20:08:06', '1', '2026-08-14 01:49:42', b'0');
INSERT IGNORE INTO `system_dict_data` (`id`, `sort`, `label`, `value`, `dict_type`, `status`, `color_type`, `css_class`, `remark`, `creator`, `create_time`, `updater`, `update_time`, `deleted`) VALUES (67, 1, '微信公众号支付', 'wx_pub', 'pay_channel_code', 0, 'success', '', '微信公众号支付', '1', '2021-12-03 10:40:24', '1', '2026-08-14 01:49:42', b'0');
INSERT IGNORE INTO `system_dict_data` (`id`, `sort`, `label`, `value`, `dict_type`, `status`, `color_type`, `css_class`, `remark`, `creator`, `create_time`, `updater`, `update_time`, `deleted`) VALUES (68, 2, '微信小程序支付', 'wx_lite', 'pay_channel_code', 0, 'success', '', '微信小程序支付', '1', '2021-12-03 10:41:06', '1', '2026-08-14 01:49:42', b'0');
INSERT IGNORE INTO `system_dict_data` (`id`, `sort`, `label`, `value`, `dict_type`, `status`, `color_type`, `css_class`, `remark`, `creator`, `create_time`, `updater`, `update_time`, `deleted`) VALUES (69, 3, '微信 App 支付', 'wx_app', 'pay_channel_code', 0, 'success', '', '微信 App 支付', '1', '2021-12-03 10:41:20', '1', '2026-08-14 01:49:42', b'0');
INSERT IGNORE INTO `system_dict_data` (`id`, `sort`, `label`, `value`, `dict_type`, `status`, `color_type`, `css_class`, `remark`, `creator`, `create_time`, `updater`, `update_time`, `deleted`) VALUES (70, 10, '支付宝 PC 网站支付', 'alipay_pc', 'pay_channel_code', 0, 'primary', '', '支付宝 PC 网站支付', '1', '2021-12-03 10:42:09', '1', '2026-08-14 01:49:42', b'0');
INSERT IGNORE INTO `system_dict_data` (`id`, `sort`, `label`, `value`, `dict_type`, `status`, `color_type`, `css_class`, `remark`, `creator`, `create_time`, `updater`, `update_time`, `deleted`) VALUES (71, 11, '支付宝 Wap 网站支付', 'alipay_wap', 'pay_channel_code', 0, 'primary', '', '支付宝 Wap 网站支付', '1', '2021-12-03 10:42:26', '1', '2026-08-14 01:49:42', b'0');
INSERT IGNORE INTO `system_dict_data` (`id`, `sort`, `label`, `value`, `dict_type`, `status`, `color_type`, `css_class`, `remark`, `creator`, `create_time`, `updater`, `update_time`, `deleted`) VALUES (72, 12, '支付宝 App 支付', 'alipay_app', 'pay_channel_code', 0, 'primary', '', '支付宝 App 支付', '1', '2021-12-03 10:42:55', '1', '2026-08-14 01:49:42', b'0');
INSERT IGNORE INTO `system_dict_data` (`id`, `sort`, `label`, `value`, `dict_type`, `status`, `color_type`, `css_class`, `remark`, `creator`, `create_time`, `updater`, `update_time`, `deleted`) VALUES (73, 14, '支付宝扫码支付', 'alipay_qr', 'pay_channel_code', 0, 'primary', '', '支付宝扫码支付', '1', '2021-12-03 10:43:10', '1', '2026-08-14 01:49:42', b'0');
INSERT IGNORE INTO `system_dict_data` (`id`, `sort`, `label`, `value`, `dict_type`, `status`, `color_type`, `css_class`, `remark`, `creator`, `create_time`, `updater`, `update_time`, `deleted`) VALUES (74, 10, '通知成功', '10', 'pay_notify_status', 0, 'success', '', '通知成功', '1', '2021-12-03 11:02:41', '1', '2026-08-14 01:49:42', b'0');
INSERT IGNORE INTO `system_dict_data` (`id`, `sort`, `label`, `value`, `dict_type`, `status`, `color_type`, `css_class`, `remark`, `creator`, `create_time`, `updater`, `update_time`, `deleted`) VALUES (75, 20, '通知失败', '20', 'pay_notify_status', 0, 'danger', '', '通知失败', '1', '2021-12-03 11:02:59', '1', '2026-08-14 01:49:42', b'0');
INSERT IGNORE INTO `system_dict_data` (`id`, `sort`, `label`, `value`, `dict_type`, `status`, `color_type`, `css_class`, `remark`, `creator`, `create_time`, `updater`, `update_time`, `deleted`) VALUES (76, 0, '等待通知', '0', 'pay_notify_status', 0, 'info', '', '未通知', '1', '2021-12-03 11:03:10', '1', '2026-08-14 01:49:42', b'0');
INSERT IGNORE INTO `system_dict_data` (`id`, `sort`, `label`, `value`, `dict_type`, `status`, `color_type`, `css_class`, `remark`, `creator`, `create_time`, `updater`, `update_time`, `deleted`) VALUES (77, 10, '支付成功', '10', 'pay_order_status', 0, 'success', '', '支付成功', '1', '2021-12-03 11:18:29', '1', '2026-08-14 01:49:42', b'0');
INSERT IGNORE INTO `system_dict_data` (`id`, `sort`, `label`, `value`, `dict_type`, `status`, `color_type`, `css_class`, `remark`, `creator`, `create_time`, `updater`, `update_time`, `deleted`) VALUES (78, 30, '支付关闭', '30', 'pay_order_status', 0, 'info', '', '支付关闭', '1', '2021-12-03 11:18:42', '1', '2026-08-14 01:49:42', b'0');
INSERT IGNORE INTO `system_dict_data` (`id`, `sort`, `label`, `value`, `dict_type`, `status`, `color_type`, `css_class`, `remark`, `creator`, `create_time`, `updater`, `update_time`, `deleted`) VALUES (79, 0, '等待支付', '0', 'pay_order_status', 0, 'info', '', '未支付', '1', '2021-12-03 11:18:18', '1', '2026-08-14 01:49:42', b'0');
INSERT IGNORE INTO `system_dict_data` (`id`, `sort`, `label`, `value`, `dict_type`, `status`, `color_type`, `css_class`, `remark`, `creator`, `create_time`, `updater`, `update_time`, `deleted`) VALUES (85, 0, '等待退款', '0', 'pay_refund_status', 0, 'info', '', '等待退款', '1', '2021-12-10 16:44:59', '1', '2026-08-14 01:49:42', b'0');
INSERT IGNORE INTO `system_dict_data` (`id`, `sort`, `label`, `value`, `dict_type`, `status`, `color_type`, `css_class`, `remark`, `creator`, `create_time`, `updater`, `update_time`, `deleted`) VALUES (86, 20, '退款失败', '20', 'pay_refund_status', 0, 'danger', '', '退款失败', '1', '2021-12-10 16:45:10', '1', '2026-08-14 01:49:42', b'0');
INSERT IGNORE INTO `system_dict_data` (`id`, `sort`, `label`, `value`, `dict_type`, `status`, `color_type`, `css_class`, `remark`, `creator`, `create_time`, `updater`, `update_time`, `deleted`) VALUES (87, 10, '退款成功', '10', 'pay_refund_status', 0, 'success', '', '退款成功', '1', '2021-12-10 16:46:26', '1', '2026-08-14 01:49:42', b'0');
INSERT IGNORE INTO `system_dict_data` (`id`, `sort`, `label`, `value`, `dict_type`, `status`, `color_type`, `css_class`, `remark`, `creator`, `create_time`, `updater`, `update_time`, `deleted`) VALUES (183, 13, '支付宝条码支付', 'alipay_bar', 'pay_channel_code', 0, 'primary', '', '支付宝条码支付', '1', '2023-02-18 23:32:24', '1', '2026-08-14 01:49:42', b'0');
INSERT IGNORE INTO `system_dict_data` (`id`, `sort`, `label`, `value`, `dict_type`, `status`, `color_type`, `css_class`, `remark`, `creator`, `create_time`, `updater`, `update_time`, `deleted`) VALUES (192, 20, '已退款', '20', 'pay_order_status', 0, 'danger', '', '已退款', '1', '2023-07-19 18:05:37', '1', '2026-08-14 01:49:42', b'0');
INSERT IGNORE INTO `system_dict_data` (`id`, `sort`, `label`, `value`, `dict_type`, `status`, `color_type`, `css_class`, `remark`, `creator`, `create_time`, `updater`, `update_time`, `deleted`) VALUES (193, 21, '请求成功，但是结果失败', '21', 'pay_notify_status', 0, 'warning', '', '请求成功，但是结果失败', '1', '2023-07-19 18:10:47', '1', '2026-08-14 01:49:42', b'0');
INSERT IGNORE INTO `system_dict_data` (`id`, `sort`, `label`, `value`, `dict_type`, `status`, `color_type`, `css_class`, `remark`, `creator`, `create_time`, `updater`, `update_time`, `deleted`) VALUES (194, 22, '请求失败', '22', 'pay_notify_status', 0, 'warning', '', NULL, '1', '2023-07-19 18:11:05', '1', '2026-08-14 01:49:42', b'0');
INSERT IGNORE INTO `system_dict_data` (`id`, `sort`, `label`, `value`, `dict_type`, `status`, `color_type`, `css_class`, `remark`, `creator`, `create_time`, `updater`, `update_time`, `deleted`) VALUES (195, 4, '微信扫码支付', 'wx_native', 'pay_channel_code', 0, 'success', '', '微信扫码支付', '1', '2023-07-19 20:07:47', '1', '2026-08-14 01:49:42', b'0');
INSERT IGNORE INTO `system_dict_data` (`id`, `sort`, `label`, `value`, `dict_type`, `status`, `color_type`, `css_class`, `remark`, `creator`, `create_time`, `updater`, `update_time`, `deleted`) VALUES (196, 5, '微信条码支付', 'wx_bar', 'pay_channel_code', 0, 'success', '', '微信条码支付\n', '1', '2023-07-19 20:08:06', '1', '2026-08-14 01:49:42', b'0');
INSERT IGNORE INTO `system_dict_data` (`id`, `sort`, `label`, `value`, `dict_type`, `status`, `color_type`, `css_class`, `remark`, `creator`, `create_time`, `updater`, `update_time`, `deleted`) VALUES (197, 1, '支付单', '1', 'pay_notify_type', 0, 'primary', '', '支付单', '1', '2023-07-20 12:23:17', '1', '2026-08-14 01:49:42', b'0');
INSERT IGNORE INTO `system_dict_data` (`id`, `sort`, `label`, `value`, `dict_type`, `status`, `color_type`, `css_class`, `remark`, `creator`, `create_time`, `updater`, `update_time`, `deleted`) VALUES (198, 2, '退款单', '2', 'pay_notify_type', 0, 'danger', '', NULL, '1', '2023-07-20 12:23:26', '1', '2026-08-14 01:49:42', b'0');
INSERT IGNORE INTO `system_dict_data` (`id`, `sort`, `label`, `value`, `dict_type`, `status`, `color_type`, `css_class`, `remark`, `creator`, `create_time`, `updater`, `update_time`, `deleted`) VALUES (199, 20, '模拟支付', 'mock', 'pay_channel_code', 0, 'default', '', '模拟支付', '1', '2023-07-29 11:10:51', '1', '2026-08-14 01:49:42', b'0');
INSERT IGNORE INTO `system_dict_data` (`id`, `sort`, `label`, `value`, `dict_type`, `status`, `color_type`, `css_class`, `remark`, `creator`, `create_time`, `updater`, `update_time`, `deleted`) VALUES (236, 21, '钱包', 'wallet', 'pay_channel_code', 0, 'primary', '', '', '1', '2023-10-01 21:46:19', '1', '2026-08-14 01:49:42', b'0');
INSERT IGNORE INTO `system_dict_data` (`id`, `sort`, `label`, `value`, `dict_type`, `status`, `color_type`, `css_class`, `remark`, `creator`, `create_time`, `updater`, `update_time`, `deleted`) VALUES (315, 4, '转账失败', '20', 'pay_transfer_status', 0, 'warning', '', '', '1', '2023-10-28 16:24:16', '1', '2026-08-14 01:49:42', b'0');
INSERT IGNORE INTO `system_dict_data` (`id`, `sort`, `label`, `value`, `dict_type`, `status`, `color_type`, `css_class`, `remark`, `creator`, `create_time`, `updater`, `update_time`, `deleted`) VALUES (316, 3, '转账成功', '10', 'pay_transfer_status', 0, 'success', '', '', '1', '2023-10-28 16:23:50', '1', '2026-08-14 01:49:42', b'0');
INSERT IGNORE INTO `system_dict_data` (`id`, `sort`, `label`, `value`, `dict_type`, `status`, `color_type`, `css_class`, `remark`, `creator`, `create_time`, `updater`, `update_time`, `deleted`) VALUES (317, 2, '转账进行中', '5', 'pay_transfer_status', 0, 'info', '', '', '1', '2023-10-28 16:23:12', '1', '2026-08-14 01:49:42', b'0');
INSERT IGNORE INTO `system_dict_data` (`id`, `sort`, `label`, `value`, `dict_type`, `status`, `color_type`, `css_class`, `remark`, `creator`, `create_time`, `updater`, `update_time`, `deleted`) VALUES (318, 1, '等待转账', '0', 'pay_transfer_status', 0, 'default', '', '', '1', '2023-10-28 16:21:43', '1', '2026-08-14 01:49:42', b'0');
INSERT IGNORE INTO `system_dict_data` (`id`, `sort`, `label`, `value`, `dict_type`, `status`, `color_type`, `css_class`, `remark`, `creator`, `create_time`, `updater`, `update_time`, `deleted`) VALUES (1335, 15, '支付宝小程序支付', 'alipay_lite', 'pay_channel_code', 0, 'primary', '', '支付宝小程序支付', '1', '2026-08-30 11:54:48', '1', '2026-08-30 11:54:48', b'0');
INSERT IGNORE INTO `system_dict_type` (`id`, `name`, `type`, `status`, `remark`, `creator`, `create_time`, `updater`, `update_time`, `deleted`, `deleted_time`) VALUES (19, '支付渠道编码类型', 'pay_channel_code', 0, '支付渠道的编码', '1', '2021-12-03 10:35:08', '1', '2026-08-14 01:49:42', b'0', NULL);
INSERT IGNORE INTO `system_dict_type` (`id`, `name`, `type`, `status`, `remark`, `creator`, `create_time`, `updater`, `update_time`, `deleted`, `deleted_time`) VALUES (20, '支付回调状态', 'pay_notify_status', 0, '支付回调状态（包括退款回调）', '1', '2021-12-03 10:53:29', '1', '2026-08-14 01:49:42', b'0', NULL);
INSERT IGNORE INTO `system_dict_type` (`id`, `name`, `type`, `status`, `remark`, `creator`, `create_time`, `updater`, `update_time`, `deleted`, `deleted_time`) VALUES (21, '支付订单状态', 'pay_order_status', 0, '支付订单状态', '1', '2021-12-03 11:17:50', '1', '2026-08-14 01:49:42', b'0', NULL);
INSERT IGNORE INTO `system_dict_type` (`id`, `name`, `type`, `status`, `remark`, `creator`, `create_time`, `updater`, `update_time`, `deleted`, `deleted_time`) VALUES (22, '退款订单状态', 'pay_refund_status', 0, '退款订单状态', '1', '2021-12-10 16:42:50', '1', '2026-08-14 01:49:42', b'0', NULL);
INSERT IGNORE INTO `system_dict_type` (`id`, `name`, `type`, `status`, `remark`, `creator`, `create_time`, `updater`, `update_time`, `deleted`, `deleted_time`) VALUES (53, '支付通知类型', 'pay_notify_type', 0, NULL, '1', '2023-07-20 12:23:03', '1', '2026-08-14 01:49:42', b'0', '1970-01-01 00:00:00');
INSERT IGNORE INTO `system_dict_type` (`id`, `name`, `type`, `status`, `remark`, `creator`, `create_time`, `updater`, `update_time`, `deleted`, `deleted_time`) VALUES (76, '转账订单状态', 'pay_transfer_status', 0, '', '1', '2023-10-28 16:18:32', '1', '2026-08-14 01:49:42', b'0', '1970-01-01 00:00:00');
INSERT IGNORE INTO `system_menu` (`id`, `name`, `permission`, `type`, `sort`, `parent_id`, `path`, `icon`, `component`, `component_name`, `status`, `visible`, `keep_alive`, `always_show`, `creator`, `create_time`, `updater`, `update_time`, `deleted`) VALUES (114, '支付管理', '', 1, 30, 0, '/pay', 'ep:money', NULL, NULL, 0, b'1', b'1', b'1', '1', '2021-12-25 16:43:41', '1', '2026-09-02 18:42:01', b'0');
INSERT IGNORE INTO `system_menu` (`id`, `name`, `permission`, `type`, `sort`, `parent_id`, `path`, `icon`, `component`, `component_name`, `status`, `visible`, `keep_alive`, `always_show`, `creator`, `create_time`, `updater`, `update_time`, `deleted`) VALUES (118, '应用信息', '', 2, 1, 114, 'app', 'fa:apple', 'pay/app/index', 'PayApp', 0, b'1', b'1', b'1', '', '2021-11-10 01:13:30', '1', '2026-08-14 01:49:42', b'0');
INSERT IGNORE INTO `system_menu` (`id`, `name`, `permission`, `type`, `sort`, `parent_id`, `path`, `icon`, `component`, `component_name`, `status`, `visible`, `keep_alive`, `always_show`, `creator`, `create_time`, `updater`, `update_time`, `deleted`) VALUES (119, '支付应用信息查询', 'pay:app:query', 3, 1, 118, '', '', '', NULL, 0, b'1', b'1', b'1', '', '2021-11-10 01:13:31', '', '2026-08-14 01:49:42', b'0');
INSERT IGNORE INTO `system_menu` (`id`, `name`, `permission`, `type`, `sort`, `parent_id`, `path`, `icon`, `component`, `component_name`, `status`, `visible`, `keep_alive`, `always_show`, `creator`, `create_time`, `updater`, `update_time`, `deleted`) VALUES (120, '支付应用信息创建', 'pay:app:create', 3, 2, 118, '', '', '', NULL, 0, b'1', b'1', b'1', '', '2021-11-10 01:13:31', '', '2026-08-14 01:49:42', b'0');
INSERT IGNORE INTO `system_menu` (`id`, `name`, `permission`, `type`, `sort`, `parent_id`, `path`, `icon`, `component`, `component_name`, `status`, `visible`, `keep_alive`, `always_show`, `creator`, `create_time`, `updater`, `update_time`, `deleted`) VALUES (121, '支付应用信息更新', 'pay:app:update', 3, 3, 118, '', '', '', NULL, 0, b'1', b'1', b'1', '', '2021-11-10 01:13:31', '', '2026-08-14 01:49:42', b'0');
INSERT IGNORE INTO `system_menu` (`id`, `name`, `permission`, `type`, `sort`, `parent_id`, `path`, `icon`, `component`, `component_name`, `status`, `visible`, `keep_alive`, `always_show`, `creator`, `create_time`, `updater`, `update_time`, `deleted`) VALUES (122, '支付应用信息删除', 'pay:app:delete', 3, 4, 118, '', '', '', NULL, 0, b'1', b'1', b'1', '', '2021-11-10 01:13:31', '', '2026-08-14 01:49:42', b'0');
INSERT IGNORE INTO `system_menu` (`id`, `name`, `permission`, `type`, `sort`, `parent_id`, `path`, `icon`, `component`, `component_name`, `status`, `visible`, `keep_alive`, `always_show`, `creator`, `create_time`, `updater`, `update_time`, `deleted`) VALUES (136, '退款订单', '', 2, 3, 114, 'refund', 'fa:registered', 'pay/refund/index', 'PayRefund', 0, b'1', b'1', b'1', '', '2021-12-25 08:29:07', '1', '2026-08-14 01:49:42', b'0');
INSERT IGNORE INTO `system_menu` (`id`, `name`, `permission`, `type`, `sort`, `parent_id`, `path`, `icon`, `component`, `component_name`, `status`, `visible`, `keep_alive`, `always_show`, `creator`, `create_time`, `updater`, `update_time`, `deleted`) VALUES (137, '退款订单查询', 'pay:refund:query', 3, 1, 136, '', '', '', NULL, 0, b'1', b'1', b'1', '', '2021-12-25 08:29:07', '', '2026-08-14 01:49:42', b'0');
INSERT IGNORE INTO `system_menu` (`id`, `name`, `permission`, `type`, `sort`, `parent_id`, `path`, `icon`, `component`, `component_name`, `status`, `visible`, `keep_alive`, `always_show`, `creator`, `create_time`, `updater`, `update_time`, `deleted`) VALUES (141, '退款订单导出', 'pay:refund:export', 3, 5, 136, '', '', '', NULL, 0, b'1', b'1', b'1', '', '2021-12-25 08:29:07', '', '2026-08-14 01:49:42', b'0');
INSERT IGNORE INTO `system_menu` (`id`, `name`, `permission`, `type`, `sort`, `parent_id`, `path`, `icon`, `component`, `component_name`, `status`, `visible`, `keep_alive`, `always_show`, `creator`, `create_time`, `updater`, `update_time`, `deleted`) VALUES (142, '支付订单', '', 2, 2, 114, 'order', 'fa:cc-paypal', 'pay/order/index', 'PayOrder', 0, b'1', b'1', b'1', '', '2021-12-25 08:49:43', '1', '2026-08-14 01:49:42', b'0');
INSERT IGNORE INTO `system_menu` (`id`, `name`, `permission`, `type`, `sort`, `parent_id`, `path`, `icon`, `component`, `component_name`, `status`, `visible`, `keep_alive`, `always_show`, `creator`, `create_time`, `updater`, `update_time`, `deleted`) VALUES (143, '支付订单查询', 'pay:order:query', 3, 1, 142, '', '', '', NULL, 0, b'1', b'1', b'1', '', '2021-12-25 08:49:43', '', '2026-08-14 01:49:42', b'0');
INSERT IGNORE INTO `system_menu` (`id`, `name`, `permission`, `type`, `sort`, `parent_id`, `path`, `icon`, `component`, `component_name`, `status`, `visible`, `keep_alive`, `always_show`, `creator`, `create_time`, `updater`, `update_time`, `deleted`) VALUES (147, '支付订单导出', 'pay:order:export', 3, 5, 142, '', '', '', NULL, 0, b'1', b'1', b'1', '', '2021-12-25 08:49:43', '', '2026-08-14 01:49:42', b'0');
INSERT IGNORE INTO `system_menu` (`id`, `name`, `permission`, `type`, `sort`, `parent_id`, `path`, `icon`, `component`, `component_name`, `status`, `visible`, `keep_alive`, `always_show`, `creator`, `create_time`, `updater`, `update_time`, `deleted`) VALUES (388, '回调通知', '', 2, 5, 114, 'notify', 'ep:mute-notification', 'pay/notify/index', 'PayNotify', 0, b'1', b'1', b'1', '', '2023-07-20 04:41:32', '1', '2026-08-14 01:49:42', b'0');
INSERT IGNORE INTO `system_menu` (`id`, `name`, `permission`, `type`, `sort`, `parent_id`, `path`, `icon`, `component`, `component_name`, `status`, `visible`, `keep_alive`, `always_show`, `creator`, `create_time`, `updater`, `update_time`, `deleted`) VALUES (389, '支付通知查询', 'pay:notify:query', 3, 1, 388, '', '', '', NULL, 0, b'1', b'1', b'1', '', '2023-07-20 04:41:32', '', '2026-08-14 01:49:42', b'0');
INSERT IGNORE INTO `system_menu` (`id`, `name`, `permission`, `type`, `sort`, `parent_id`, `path`, `icon`, `component`, `component_name`, `status`, `visible`, `keep_alive`, `always_show`, `creator`, `create_time`, `updater`, `update_time`, `deleted`) VALUES (778, '支付渠道查询', 'pay:channel:query', 3, 10, 118, '', '', '', '', 0, b'1', b'1', b'1', '1', '2024-04-24 19:53:01', '1', '2026-08-14 01:49:42', b'0');
INSERT IGNORE INTO `system_menu` (`id`, `name`, `permission`, `type`, `sort`, `parent_id`, `path`, `icon`, `component`, `component_name`, `status`, `visible`, `keep_alive`, `always_show`, `creator`, `create_time`, `updater`, `update_time`, `deleted`) VALUES (779, '支付渠道创建', 'pay:channel:create', 3, 11, 118, '', '', '', '', 0, b'1', b'1', b'1', '1', '2024-04-24 19:53:18', '1', '2026-08-14 01:49:42', b'0');
INSERT IGNORE INTO `system_menu` (`id`, `name`, `permission`, `type`, `sort`, `parent_id`, `path`, `icon`, `component`, `component_name`, `status`, `visible`, `keep_alive`, `always_show`, `creator`, `create_time`, `updater`, `update_time`, `deleted`) VALUES (780, '支付渠道更新', 'pay:channel:update', 3, 12, 118, '', '', '', '', 0, b'1', b'1', b'1', '1', '2024-04-24 19:53:32', '1', '2026-08-14 01:49:42', b'0');
INSERT IGNORE INTO `system_menu` (`id`, `name`, `permission`, `type`, `sort`, `parent_id`, `path`, `icon`, `component`, `component_name`, `status`, `visible`, `keep_alive`, `always_show`, `creator`, `create_time`, `updater`, `update_time`, `deleted`) VALUES (781, '支付渠道删除', 'pay:channel:delete', 3, 13, 118, '', '', '', '', 0, b'1', b'1', b'1', '1', '2024-04-24 19:54:34', '1', '2026-08-14 01:49:42', b'0');
