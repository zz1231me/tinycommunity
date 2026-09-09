// client/src/pages/UserProfile.tsx
// 다른 사람의 공개 프로필.
//
// 보이는 것은 "내가 어차피 볼 수 있는 것" 뿐이다 — 서버가 보는 사람의 게시판
// 권한으로 글 수와 최근 글을 걸러서 준다. 프로필이 못 보는 게시판의 활동을
// 엿보는 통로가 되면 안 된다.

import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileText, MessageCircle, UserRound, Users } from 'lucide-react';
import { Avatar } from '../components/Avatar';
import { PageContainer } from '../components/common/PageContainer';
import { PageHeader } from '../components/common/PageHeader';
import { SubscribeButton } from '../components/social/SubscribeButton';
import { SendMessageButton } from '../components/messages/SendMessageButton';
import { fetchUserProfile } from '../api/social';
import { socialKeys } from '../api/queryKeys';
import { formatDate, formatRelativeDate } from '../utils/date';
import { ListState } from '../components/common/ListState';

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-3 dark:bg-slate-800/60">
      <span className="text-slate-400">{icon}</span>
      <div className="min-w-0">
        <div className="text-lg font-bold leading-tight tabular-nums text-slate-900 dark:text-slate-100">
          {value.toLocaleString()}
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
      </div>
    </div>
  );
}

export default function UserProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: socialKeys.profile(id ?? ''),
    queryFn: ({ signal }) => fetchUserProfile(id as string, signal),
    enabled: !!id,
  });

  const notFound =
    isError && (error as { response?: { status?: number } })?.response?.status === 404;

  return (
    <PageContainer>
      <PageHeader
        title="프로필"
        icon={<UserRound className="h-6 w-6 text-primary-600 dark:text-primary-400" />}
      >
        <button onClick={() => navigate(-1)} className="btn-secondary" aria-label="뒤로">
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          뒤로
        </button>
      </PageHeader>

      {isLoading ? (
        <div className="card p-10 text-center text-sm text-slate-500 dark:text-slate-400">
          불러오는 중…
        </div>
      ) : notFound ? (
        <div className="card p-10 text-center text-sm text-slate-500 dark:text-slate-400">
          존재하지 않거나 활동하지 않는 사용자입니다.
        </div>
      ) : isError || !data ? (
        <div className="card p-10 text-center text-sm text-slate-500 dark:text-slate-400">
          프로필을 불러오지 못했습니다.
        </div>
      ) : (
        <div className="space-y-4">
          <section className="card p-5">
            <div className="flex flex-wrap items-start gap-4">
              <Avatar user={{ id: data.id, name: data.name, avatar: data.avatar }} size="lg" />

              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {data.name}
                </h2>
                <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                  @{data.id}
                  {data.roleName && ` · ${data.roleName}`}
                </p>
                <p className="mt-0.5 text-xs text-slate-400">{formatDate(data.joinedAt)} 가입</p>
              </div>

              {/* 자기 자신에게는 팔로우도 메시지도 의미가 없다 — 버튼 자체를 두지 않는다 */}
              {!data.isSelf && (
                <div className="flex flex-shrink-0 items-center gap-2">
                  <SubscribeButton targetType="user" targetId={data.id} />
                  <SendMessageButton recipientId={data.id} recipientName={data.name} />
                </div>
              )}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat
                icon={<FileText className="h-5 w-5" />}
                label="작성 글"
                value={data.postCount}
              />
              <Stat
                icon={<MessageCircle className="h-5 w-5" />}
                label="댓글"
                value={data.commentCount}
              />
              <Stat icon={<Users className="h-5 w-5" />} label="팔로워" value={data.followers} />
              <Stat
                icon={<UserRound className="h-5 w-5" />}
                label="팔로잉"
                value={data.following}
              />
            </div>

            <p className="mt-3 text-xs text-slate-400">
              작성 글 수와 최근 글은 회원님이 읽을 수 있는 게시판만 집계합니다.
            </p>
          </section>

          <section className="card overflow-hidden">
            <h3 className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
              최근 글
            </h3>
            {data.recentPosts.length === 0 ? (
              <ListState size="roomy">볼 수 있는 최근 글이 없습니다.</ListState>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.recentPosts.map(post => (
                  <li key={post.id}>
                    <Link
                      to={`/dashboard/posts/${post.boardType}/${post.id}`}
                      className="block px-4 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                        {post.title}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span className="max-w-32 truncate">{post.boardName}</span>
                        <span aria-hidden="true">·</span>
                        <span>{formatRelativeDate(post.createdAt)}</span>
                        <span aria-hidden="true">·</span>
                        <span>조회 {post.viewCount.toLocaleString()}</span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </PageContainer>
  );
}
