import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="px-6 py-20 text-center">
      <h1 className="text-xl font-bold mb-2">没有找到这一页</h1>
      <p className="text-x-gray text-sm mb-6">这条记录可能已经被删除了。</p>
      <Link
        href="/"
        className="inline-block px-5 py-2 bg-x-blue text-white text-sm font-bold rounded-full hover:bg-x-blue/90 transition-colors"
      >
        回到首页
      </Link>
    </div>
  );
}
