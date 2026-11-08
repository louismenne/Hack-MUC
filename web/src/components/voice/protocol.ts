export const voiceError = (error: unknown) => JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) });
export const voiceResult = (data: object) => JSON.stringify({ success: true, ...data });
