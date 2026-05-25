import { User, Post } from './types';

export const currentUser: User = {
  id: 'user-me',
  username: 'myjournal',
  displayName: '我的日记本',
  avatar: '',
  banner: '',
  bio: '记录生活的点滴，捕捉思维的火花',
  joinedDate: '2025-01',
};

export const mockPosts: Post[] = [
  {
    id: 'post-welcome-1',
    entryType: 'diary',
    title: '欢迎来到你的日记本',
    content: '这是你的私人空间，像发推一样记录生活。\n\n随想：短小精悍的想法，上限 280 字。\n日记：更长的记录，最多 2000 字。\n\n所有内容只保存在你的设备上，没有人能看到。想到什么就写什么，不用在意别人的眼光。',
    images: [],
    createdAt: '2025-05-25T10:00:00Z',
    replies: [
      {
        id: 'reply-w-1',
        postId: 'post-welcome-1',
        content: '你可以像这样给自己回复，形成一个 thread。',
        createdAt: '2025-05-25T10:05:00Z',
      },
    ],
    isLiked: true,
    views: 3,
    tags: ['入门'],
  },
  {
    id: 'post-welcome-2',
    entryType: 'thought',
    content: '第一条随想：今天开始用这个日记本记录生活了。想到什么就写什么，自由自在。',
    images: [],
    createdAt: '2025-05-25T09:30:00Z',
    replies: [],
    isLiked: false,
    views: 1,
    mood: '😊',
  },
  {
    id: 'post-welcome-3',
    entryType: 'thought',
    content: '支持导出为 Markdown 文件，随时可以备份你的记录。点击条目下方的导出按钮试试。',
    images: [],
    createdAt: '2025-05-25T09:00:00Z',
    replies: [],
    isLiked: false,
    views: 1,
    tags: ['功能提示'],
  },
];
