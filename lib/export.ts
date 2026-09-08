import { Post, User } from './types';
import { getPostCategoryLabel } from './categories';
import { Transaction } from './ledger';

export interface DiaryBackup {
  version: 1;
  exportedAt: string;
  posts: Post[];
  user: User;
  ledger: Transaction[];
}

export function formatDateCN(dateString: string): string {
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}年${month}月${day}日 ${hours}:${minutes}`;
}

function getEntryTypeLabel(post: Pick<Post, 'entryType' | 'category'>): string {
  return getPostCategoryLabel(post);
}

function downloadMarkdown(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportPostAsMarkdown(post: Post) {
  const typeLabel = getEntryTypeLabel(post);
  const date = formatDateCN(post.createdAt);

  let md = '';

  if (post.title) {
    md += `# ${post.title}\n\n`;
  } else {
    md += `# ${typeLabel}\n\n`;
  }

  md += `> 类型：${typeLabel} | 时间：${date}\n\n`;
  md += `${post.content}\n\n`;

  if (post.images.length > 0) {
    md += `## 图片\n\n`;
    post.images.forEach((img, i) => {
      md += `![图片${i + 1}](${img})\n\n`;
    });
  }

  if (post.tags && post.tags.length > 0) {
    md += `标签：${post.tags.join(', ')}\n\n`;
  }

  md += `---\n\n`;
  md += `发表于 ${post.createdAt}\n`;

  const safeTitle = post.title
    ? post.title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 30)
    : typeLabel;
  const filename = `${safeTitle}_${post.createdAt.slice(0, 10)}.md`;

  downloadMarkdown(md, filename);
}

export function exportPostsAsMarkdown(posts: Post[], filename?: string) {
  if (posts.length === 0) return;

  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  let md = `# 我的日记本导出\n\n`;
  md += `生成时间：${today}\n`;
  md += `共 ${posts.length} 条记录\n\n`;
  md += `---\n\n`;

  posts.forEach((post, index) => {
    const typeLabel = getEntryTypeLabel(post);
    const date = formatDateCN(post.createdAt);

    md += `## ${index + 1}. ${post.title || typeLabel}\n\n`;
    md += `> 类型：${typeLabel} | 时间：${date}\n\n`;
    md += `${post.content}\n\n`;

    if (post.images.length > 0) {
      post.images.forEach((img, i) => {
        md += `![图片${i + 1}](${img})\n\n`;
      });
    }

    if (post.tags && post.tags.length > 0) {
      md += `标签：${post.tags.join(', ')}\n\n`;
    }

    md += `---\n\n`;
  });

  const defaultName = `日记本导出_${today}_${posts.length}条.md`;
  downloadMarkdown(md, filename || defaultName);
}

function downloadJson(value: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportBackupAsJson(payload: Omit<DiaryBackup, 'version' | 'exportedAt'>) {
  const today = new Date().toISOString().slice(0, 10);
  downloadJson({ version: 1, exportedAt: new Date().toISOString(), ...payload }, `日记本完整备份_${today}.json`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPost(value: unknown): value is Post {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string'
    && (value.entryType === 'thought' || value.entryType === 'diary' || value.entryType === 'article')
    && (value.category === undefined || typeof value.category === 'string')
    && typeof value.content === 'string'
    && Array.isArray(value.images)
    && value.images.every((image) => typeof image === 'string')
    && typeof value.createdAt === 'string'
    && Array.isArray(value.replies)
    && value.replies.every((reply) => isRecord(reply)
      && typeof reply.id === 'string'
      && typeof reply.postId === 'string'
      && typeof reply.content === 'string'
      && typeof reply.createdAt === 'string')
    && typeof value.isLiked === 'boolean';
}

function isUser(value: unknown): value is User {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string'
    && typeof value.username === 'string'
    && typeof value.displayName === 'string'
    && typeof value.avatar === 'string'
    && typeof value.banner === 'string'
    && typeof value.bio === 'string'
    && typeof value.joinedDate === 'string'
    && (value.birthDate === undefined || typeof value.birthDate === 'string');
}

function isTransaction(value: unknown): value is Transaction {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string'
    && (value.type === 'income' || value.type === 'expense')
    && typeof value.amount === 'number'
    && Number.isFinite(value.amount)
    && typeof value.category === 'string'
    && (value.note === undefined || typeof value.note === 'string')
    && typeof value.date === 'string'
    && typeof value.createdAt === 'string';
}

export function parseBackup(value: unknown): DiaryBackup | null {
  if (!isRecord(value) || value.version !== 1 || !isUser(value.user)
    || !Array.isArray(value.posts) || !value.posts.every(isPost)
    || !Array.isArray(value.ledger) || !value.ledger.every(isTransaction)) {
    return null;
  }
  return {
    version: 1,
    exportedAt: typeof value.exportedAt === 'string' ? value.exportedAt : new Date().toISOString(),
    posts: value.posts,
    user: value.user,
    ledger: value.ledger,
  };
}
