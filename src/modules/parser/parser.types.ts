import type { ParsedLaunchCommand } from '../../shared/types.js';

export interface ParseResult {
  success: boolean;
  command?: ParsedLaunchCommand;
  error?: string;
}

export interface RawTweetPayload {
  id: string;
  text: string;
  author_id: string;
  author_username?: string;
  author_display_name?: string;
  attachments?: {
    media_keys?: string[];
  };
  includes?: {
    media?: Array<{
      media_key: string;
      url?: string;
      preview_image_url?: string;
      type: string;
    }>;
  };
}
