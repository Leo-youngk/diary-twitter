import { formatDateCN } from './utils';

export interface MarkdownPost {
  /** Only older posts have these two. */
  category: string;
  title: string;
  content: string;
  createdAt: string;
  /** Absolute image URLs. */
  imageUrls: string[];
  replies: Array<{ content: string; createdAt: string }>;
}

function download(content: string, filename: string): void {
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

function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function heading(post: MarkdownPost): string {
  return post.title || formatDateCN(post.createdAt);
}

function body(post: MarkdownPost): string {
  const meta = post.title ? formatDateCN(post.createdAt) : '';
  const tags = [meta, post.category].filter(Boolean).join(' · ');
  let md = tags ? `> ${tags}\n\n` : '';
  md += `${post.content}\n\n`;
  post.imageUrls.forEach((url, i) => { md += `![图片${i + 1}](${url})\n\n`; });
  if (post.replies.length > 0) {
    md += `**追加**\n\n`;
    post.replies.forEach((reply) => { md += `- ${formatDateCN(reply.createdAt)}：${reply.content}\n`; });
    md += '\n';
  }
  return md;
}

export function exportPostMarkdown(post: MarkdownPost): void {
  const md = `# ${heading(post)}\n\n${body(post)}---\n\n发表于 ${post.createdAt}\n`;
  const name = post.title ? post.title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 30) : '随想';
  download(md, `${name}_${post.createdAt.slice(0, 10)}.md`);
}

export function exportPostsMarkdown(posts: MarkdownPost[], filename?: string): void {
  if (posts.length === 0) return;
  let md = `# 我的日记本导出\n\n生成时间：${today()}\n共 ${posts.length} 条记录\n\n---\n\n`;
  posts.forEach((post) => {
    md += `## ${heading(post)}\n\n${body(post)}---\n\n`;
  });
  download(md, filename || `日记本导出_${today()}_${posts.length}条.md`);
}
