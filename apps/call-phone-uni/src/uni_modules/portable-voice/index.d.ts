/** HTTPS surface. The host requests microphone permission before opening. */
export function openVoice(url: string, callback: (event: string) => void): void;
export function closeVoice(): void;
