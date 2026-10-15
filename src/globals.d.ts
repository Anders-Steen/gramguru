// Minimal WebExtension typings so we can stay dependency-free.
declare const browser: {
  storage: {
    local: {
      get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
    };
    onChanged: {
      addListener(
        callback: (
          changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
          area: string,
        ) => void,
      ): void;
    };
  };
  runtime: {
    getURL(path: string): string;
    sendMessage(message: unknown): Promise<unknown>;
    onMessage: {
      addListener(
        callback: (
          message: unknown,
          sender: { tab?: { id?: number } },
        ) => void,
      ): void;
    };
  };
  action: {
    setBadgeText(details: { tabId: number; text: string }): Promise<void>;
    setBadgeBackgroundColor(details: { tabId: number; color: string }): Promise<void>;
  };
};
