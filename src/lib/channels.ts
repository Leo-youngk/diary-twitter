import type { Channel } from './schema';

/**
 * The platforms other than X, each published through Buffer on its own: its
 * own switch, per-post flag, delivery table and numbers. X keeps its own code.
 */
export const CHANNELS = {
  substack: {
    name: 'Substack',
    /** What one publication is called there. */
    item: 'Note',
    flag: 'substackSync',
    setting: 'substackSyncEnabled',
    table: 'substackposts',
    metrics: 'substackmetrics',
  },
  threads: {
    name: 'Threads',
    item: '帖子',
    flag: 'threadsSync',
    setting: 'threadsSyncEnabled',
    table: 'threadsposts',
    metrics: 'threadsmetrics',
  },
} as const;

export const CHANNEL_IDS = Object.keys(CHANNELS) as Channel[];
