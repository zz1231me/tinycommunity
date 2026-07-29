import { useState, useEffect } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { Users, UserCheck, UserPlus, FileText, MessageSquare, LayoutGrid } from 'lucide-react';
import { fetchAdminStats } from '../../../api/admin';
import { AdminStats } from '../../../types/admin.types';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { AdminSection } from '../common/AdminSection';

// 차트 축/그리드는 라이트·다크 모두에서 읽히는 중립 톤으로 고정(테마 감지 불필요)
const AXIS = '#94a3b8';
const GRID = 'rgba(148,163,184,0.2)';
const TEAL = '#14b8a6';
const AMBER = '#f59e0b'; // 게시글 계열 — teal과 대비되는 따뜻한 액센트(파랑 배제)
// 역할 파이 팔레트 — 파랑/보라 배제, graphite·teal 정체성에 맞춘 대비 조합
const PIE_COLORS = ['#14b8a6', '#0d9488', '#f59e0b', '#64748b', '#f43f5e', '#10b981', '#334155'];

const TOOLTIP_STYLE = {
  background: 'rgba(15,23,42,0.92)',
  border: 'none',
  borderRadius: 12,
  color: '#f1f5f9',
  fontSize: 12,
  padding: '8px 12px',
} as const;

// 차트 3종(로그인·가입·게시글)이 공유하는 축/그리드/여백 — 반복 제거
const AXIS_TICK = { fill: AXIS, fontSize: 11 };
const CHART_MARGIN = { top: 8, right: 8, left: -18, bottom: 0 };
const GRID_PROPS = { strokeDasharray: '3 3', stroke: GRID, vertical: false };
const X_AXIS_PROPS = { dataKey: 'label', tick: AXIS_TICK, tickLine: false, axisLine: false };
const Y_AXIS_PROPS = {
  allowDecimals: false,
  tick: AXIS_TICK,
  tickLine: false,
  axisLine: false,
  width: 32,
};
const BAR_CURSOR = { fill: 'rgba(148,163,184,0.12)' };

const monthLabel = (key: string) => `${Number(key.slice(5, 7))}월`;
const dayLabel = (key: string) => key.slice(5).replace('-', '/');

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div className="card p-4 flex items-center gap-3">
      <div
        className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
          accent
            ? 'bg-secondary-100 text-secondary-600 dark:bg-secondary-900/40 dark:text-secondary-300'
            : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
        }`}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums leading-tight">
          {value.toLocaleString()}
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
      </div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">{title}</h3>
      <div className="h-64">{children}</div>
    </div>
  );
}

const DashboardManagement = () => {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setError(false);
    fetchAdminStats(controller.signal)
      .then(setStats)
      .catch(err => {
        if (err?.name !== 'AbortError' && err?.name !== 'CanceledError') setError(true);
      });
    return () => controller.abort();
  }, []);

  if (error) {
    return (
      <div className="text-center py-12 text-sm text-red-500 dark:text-red-400">
        통계를 불러오지 못했습니다.
      </div>
    );
  }
  if (!stats) return <LoadingSpinner message="통계를 불러오는 중..." />;

  const { summary } = stats;
  const signupData = stats.signupsByMonth.map(b => ({ label: monthLabel(b.key), count: b.count }));
  const postData = stats.postsByMonth.map(b => ({ label: monthLabel(b.key), count: b.count }));
  const loginData = stats.loginsByDay.map(b => ({ label: dayLabel(b.key), count: b.count }));

  return (
    <div className="space-y-6">
      {/* 요약 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <StatCard
          icon={<Users className="w-5 h-5" />}
          label="전체 사용자"
          value={summary.totalUsers}
          accent
        />
        <StatCard
          icon={<UserCheck className="w-5 h-5" />}
          label="활성"
          value={summary.activeUsers}
        />
        <StatCard
          icon={<UserPlus className="w-5 h-5" />}
          label="승인 대기"
          value={summary.pendingUsers}
        />
        <StatCard
          icon={<FileText className="w-5 h-5" />}
          label="게시글"
          value={summary.totalPosts}
        />
        <StatCard
          icon={<MessageSquare className="w-5 h-5" />}
          label="댓글"
          value={summary.totalComments}
        />
        <StatCard
          icon={<LayoutGrid className="w-5 h-5" />}
          label="게시판"
          value={summary.totalBoards}
        />
      </div>

      <AdminSection
        title="활동 추이"
        description="최근 로그인·가입·게시글 흐름과 역할 분포를 한눈에 확인합니다."
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* 로그인 활동 (14일) */}
          <ChartCard title="로그인 활동 (최근 14일)">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={loginData} margin={CHART_MARGIN}>
                <defs>
                  <linearGradient id="loginFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={TEAL} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={TEAL} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis {...X_AXIS_PROPS} />
                <YAxis {...Y_AXIS_PROPS} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  cursor={{ stroke: TEAL, strokeOpacity: 0.3 }}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  name="로그인"
                  stroke={TEAL}
                  strokeWidth={2}
                  fill="url(#loginFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* 역할별 분포 */}
          <ChartCard title="역할별 사용자 분포">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stats.usersByRole}
                  dataKey="count"
                  nameKey="role"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={85}
                  paddingAngle={2}
                  label={({ name, value }) => `${name} ${value}`}
                  labelLine={false}
                  fontSize={11}
                  stroke="none"
                >
                  {stats.usersByRole.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* 월별 가입 */}
          <ChartCard title="월별 가입">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={signupData} margin={CHART_MARGIN}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis {...X_AXIS_PROPS} />
                <YAxis {...Y_AXIS_PROPS} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={BAR_CURSOR} />
                <Bar
                  dataKey="count"
                  name="가입"
                  fill={TEAL}
                  radius={[6, 6, 0, 0]}
                  maxBarSize={48}
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* 월별 게시글 */}
          <ChartCard title="월별 게시글">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={postData} margin={CHART_MARGIN}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis {...X_AXIS_PROPS} />
                <YAxis {...Y_AXIS_PROPS} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={BAR_CURSOR} />
                <Bar
                  dataKey="count"
                  name="게시글"
                  fill={AMBER}
                  radius={[6, 6, 0, 0]}
                  maxBarSize={48}
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </AdminSection>
    </div>
  );
};

export default DashboardManagement;
