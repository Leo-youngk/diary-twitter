import { Post } from './types';

export function formatDateCN(dateString: string): string {
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}年${month}月${day}日 ${hours}:${minutes}`;
}

function getEntryTypeLabel(type: string): string {
  return type === 'diary' ? '日记' : '随想';
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
  const typeLabel = getEntryTypeLabel(post.entryType);
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
    const typeLabel = getEntryTypeLabel(post.entryType);
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
