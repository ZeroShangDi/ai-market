/** Transport version. Unsupported platforms return 0. */
export function getApiVersion(): number;
/** 1 = granted, 0 = denied, -1 = unavailable. Never opens settings. */
export function getPermission(): number;
/** One-shot JSON command/result. Commands: show, hide, status, text, settings, front, dispose, voiceState, packageState, packageInstall, packageActivate, packageDelete. */
export function execute(command: string, payload: string, callback: (result: string) => void): void;
/** Register once per JS runtime. Multiplex subscribers on the JS side. */
export function onOverlayEvent(callback: (event: string) => void): void;
export function offOverlayEvent(): void;
