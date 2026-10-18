/** HTTPS surface. The host requests microphone permission before opening. */
export function openVoice(url: string, callback: (event: string) => void): void;
export function closeVoice(): void;

export function openDesktopVoice(url: string, callback: (event: string) => void): void;

export function confirmTask(prompt: string, callback: (confirmed: boolean) => void): void;
export function deliverTask(payload: string): void;
