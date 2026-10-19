export function pendingFiles(): string;
export function readPendingFile(id: string): string;
export function discardPendingFile(id: string): boolean;
export function readDocument(uri: string): string;
export function shareDocument(path: string, name: string): void;
