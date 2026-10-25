export function pendingFiles(): string;
export function shareBase64Document(name: string, content: string, callback: (error: string) => void): void;
export function readPendingFile(id: string): string;
export function discardPendingFile(id: string): boolean;
export function readDocument(uri: string): string;
export function shareDocument(path: string, name: string, callback: (error: string) => void): void;

export function shareTextDocument(name: string, content: string, callback: (error: string) => void): void;
