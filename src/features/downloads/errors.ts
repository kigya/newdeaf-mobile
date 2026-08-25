export type DownloadGateCode = 'wifi' | 'storage';

export class DownloadGateError extends Error {
  code: DownloadGateCode;

  constructor(code: DownloadGateCode, message: string) {
    super(message);
    this.name = 'DownloadGateError';
    this.code = code;
  }
}

export function isDownloadGateError(error: unknown): error is DownloadGateError {
  return error instanceof DownloadGateError;
}
