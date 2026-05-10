"use client";

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
  LineChart,
  Line,
  ReferenceDot,
  ReferenceLine
} from "recharts";

/*
  TL Finance Core — Chart colour system
  ======================================
  Anchored to the brand purple (#7A3CFF) → cyan (#00D1C7) gradient.
  Categorical palettes spread from purple through mid-tones to cyan so charts
  read consistently in both light and dark themes.

  Rules:
  - Grid lines & axes: CSS variable-based (theme-agnostic)
  - Tooltips: CSS variable-based
  - Data series: fixed brand-anchored hex so colours are predictable
  - No system colours (blue-500, green-500 etc.)
*/

// General categorical palette — 12 stops, purple→cyan arc
const PALETTE = [
  "#7A3CFF", // brand purple
  "#9B5EFF",
  "#B87BFF",
  "#5B8FFF",
  "#3BBFFF",
  "#00D1C7", // brand cyan
  "#00B8A9",
  "#00A0C8",
  "#4C7FFF",
  "#A056FF",
  "#CF5BFF",
  "#5B3FCC"
];

// Income bars — cooler spectrum (purple → cyan)
const INCOME_PALETTE = [
  "#7A3CFF",
  "#5B8FFF",
  "#3BBFFF",
  "#00D1C7",
  "#00B8A9",
  "#4C7FFF",
  "#9B5EFF",
  "#00A0C8"
];

// Expense bars — warmer deviations from purple, clearly distinct from income
const EXPENSE_PALETTE = [
  "#FF3C6B",
  "#FF6B3C",
  "#FFB03C",
  "#FF3CAA",
  "#D93CFF",
  "#FF5B8F",
  "#E05200",
  "#C4003C"
];

// Named single-use colours — always from brand palette
const BRAND_PURPLE = "#7A3CFF";
const BRAND_CYAN   = "#00D1C7";
const BRAND_RED    = "#FF3C6B";
const BRAND_MUTED  = "#94A3B8"; // slate-400 — neutral baseline

function fmtMoney(n: number, currency: string) {
  return (
    new Intl.NumberFormat("de-CH", { maximumFractionDigits: 0 }).format(n) +
    " " +
    currency
  );
}

function tooltipStyle(): React.CSSProperties {
  return {
    backgroundColor: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: 6,
    fontSize: 12,
    color: "hsl(var(--card-foreground))"
  };
}

const TOOLTIP_LABEL_STYLE: React.CSSProperties = {
  color: "hsl(var(--card-foreground))",
  fontWeight: 500,
  marginBottom: 4
};
const TOOLTIP_ITEM_STYLE: React.CSSProperties = {
  color: "hsl(var(--card-foreground))"
};

// Shared axis / grid props
const AXIS_TICK = { fontSize: 12, fill: "hsl(var(--muted-foreground))" };
const AXIS_TICK_SM = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };
const GRID_STROKE = "hsl(var(--border))";

// ────────────────────────────────────────────────────────────────────────────
// Income split pie
// ────────────────────────────────────────────────────────────────────────────

export function IncomeSplitChart({
  data,
  currency
}: {
  data: { name: string; amount: string }[];
  currency: string;
}) {
  const rows = data
    .map((d) => ({ name: d.name, value: Number(d.amount) }))
    .filter((d) => d.value > 0);
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No income data yet.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie
          data={rows}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={90}
          paddingAngle={2}
        >
          {rows.map((_, i) => (
            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(v: number) => fmtMoney(v, currency)}
          contentStyle={tooltipStyle()}
          labelStyle={TOOLTIP_LABEL_STYLE}
          itemStyle={TOOLTIP_ITEM_STYLE}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Expense distribution pie
// ────────────────────────────────────────────────────────────────────────────

export function ExpenseDistributionChart({
  data,
  currency
}: {
  data: { name: string; amount: string }[];
  currency: string;
}) {
  const rows = data
    .map((d) => ({ name: d.name, value: Number(d.amount) }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No expense data yet.</p>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie
          data={rows}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          outerRadius={95}
        >
          {rows.map((_, i) => (
            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(v: number) => fmtMoney(v, currency)}
          contentStyle={tooltipStyle()}
          labelStyle={TOOLTIP_LABEL_STYLE}
          itemStyle={TOOLTIP_ITEM_STYLE}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Income vs Expenses stacked bar
// ────────────────────────────────────────────────────────────────────────────

export function IncomeVsExpenseChart({
  incomeStreams,
  expenseStreams,
  currency
}: {
  incomeStreams: { name: string; amount: string }[];
  expenseStreams: { name: string; amount: string }[];
  currency: string;
}) {
  const incomeRows = incomeStreams
    .map((s) => ({ name: s.name, value: Number(s.amount) }))
    .filter((s) => s.value > 0);
  const expenseRows = expenseStreams
    .map((s) => ({ name: s.name, value: Number(s.amount) }))
    .filter((s) => s.value > 0);

  if (incomeRows.length === 0 && expenseRows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Add a few budget items to see your income vs expenses.
      </p>
    );
  }

  const incomeKeys = incomeRows.map((r) => `i:${r.name}`);
  const expenseKeys = expenseRows.map((r) => `e:${r.name}`);

  const rows: Record<string, string | number>[] = [
    {
      bucket: "Income",
      ...Object.fromEntries(incomeRows.map((r) => [`i:${r.name}`, r.value]))
    },
    {
      bucket: "Expenses",
      ...Object.fromEntries(expenseRows.map((r) => [`e:${r.name}`, r.value]))
    }
  ];

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={rows} barCategoryGap="35%">
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
        <XAxis dataKey="bucket" tick={AXIS_TICK} />
        <YAxis
          tick={AXIS_TICK}
          tickFormatter={(v: number) => fmtMoney(v, currency)}
          width={90}
        />
        <Tooltip
          formatter={(v: number, name: string) => [
            fmtMoney(v, currency),
            name.replace(/^[ie]:/, "")
          ]}
          contentStyle={tooltipStyle()}
          labelStyle={TOOLTIP_LABEL_STYLE}
          itemStyle={TOOLTIP_ITEM_STYLE}
        />
        {incomeKeys.map((key, i) => (
          <Bar
            key={key}
            dataKey={key}
            stackId="income"
            fill={INCOME_PALETTE[i % INCOME_PALETTE.length]}
            radius={i === incomeKeys.length - 1 ? [4, 4, 0, 0] : 0}
          />
        ))}
        {expenseKeys.map((key, i) => (
          <Bar
            key={key}
            dataKey={key}
            stackId="expenses"
            fill={EXPENSE_PALETTE[i % EXPENSE_PALETTE.length]}
            radius={i === expenseKeys.length - 1 ? [4, 4, 0, 0] : 0}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function IncomeVsExpenseLegend({
  incomeStreams,
  expenseStreams
}: {
  incomeStreams: { name: string; amount: string }[];
  expenseStreams: { name: string; amount: string }[];
}) {
  const incomeRows = incomeStreams
    .map((s) => ({ name: s.name, value: Number(s.amount) }))
    .filter((s) => s.value > 0);
  const expenseRows = expenseStreams
    .map((s) => ({ name: s.name, value: Number(s.amount) }))
    .filter((s) => s.value > 0);

  if (incomeRows.length === 0 && expenseRows.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 text-xs">
      {incomeRows.length > 0 && (
        <div>
          <p className="mb-1 font-medium text-muted-foreground">Income streams</p>
          <ul className="space-y-1">
            {incomeRows.map((r, i) => (
              <li key={r.name} className="flex items-center gap-2">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm shrink-0"
                  style={{ backgroundColor: INCOME_PALETTE[i % INCOME_PALETTE.length] }}
                />
                <span>{r.name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {expenseRows.length > 0 && (
        <div>
          <p className="mb-1 font-medium text-muted-foreground">Expense groups</p>
          <ul className="space-y-1">
            {expenseRows.map((r, i) => (
              <li key={r.name} className="flex items-center gap-2">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm shrink-0"
                  style={{ backgroundColor: EXPENSE_PALETTE[i % EXPENSE_PALETTE.length] }}
                />
                <span>{r.name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Balance forecast line — brand purple
// ────────────────────────────────────────────────────────────────────────────

export function BalanceForecastChart({
  data,
  currency
}: {
  data: { month: string; totalBaseCurrency: string }[];
  currency: string;
}) {
  const rows = data.map((p) => ({
    month: p.month,
    Balance: Number(p.totalBaseCurrency)
  }));
  if (rows.length === 0) return null;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={rows}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
        <XAxis
          dataKey="month"
          tick={AXIS_TICK_SM}
          interval="preserveStartEnd"
          minTickGap={32}
        />
        <YAxis
          tick={AXIS_TICK}
          tickFormatter={(v: number) => fmtMoney(v, currency)}
          width={90}
        />
        <Tooltip
          formatter={(v: number) => fmtMoney(v, currency)}
          contentStyle={tooltipStyle()}
          labelStyle={TOOLTIP_LABEL_STYLE}
          itemStyle={TOOLTIP_ITEM_STYLE}
        />
        <Line
          type="monotone"
          dataKey="Balance"
          stroke={BRAND_PURPLE}
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Daily account balance walk — brand purple line, cyan today marker
// ────────────────────────────────────────────────────────────────────────────

export function DailyAccountChart({
  data,
  currency,
  todayIndex
}: {
  data: { date: string; totalBaseCurrency: string }[];
  currency: string;
  todayIndex: number;
}) {
  const rows = data.map((p) => ({
    date: p.date.slice(5, 10), // MM-DD
    Balance: Number(p.totalBaseCurrency)
  }));
  if (rows.length === 0) return null;
  const todayRow = rows[todayIndex];
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={rows}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
        <XAxis
          dataKey="date"
          tick={AXIS_TICK_SM}
          interval="preserveStartEnd"
          minTickGap={28}
        />
        <YAxis
          tick={AXIS_TICK}
          tickFormatter={(v: number) => fmtMoney(v, currency)}
          width={90}
        />
        <Tooltip
          formatter={(v: number) => fmtMoney(v, currency)}
          contentStyle={tooltipStyle()}
          labelStyle={TOOLTIP_LABEL_STYLE}
          itemStyle={TOOLTIP_ITEM_STYLE}
        />
        {/* Zero line — warning red for negative balance context */}
        <ReferenceLine y={0} stroke={BRAND_RED} strokeDasharray="3 3" />
        {todayRow && (
          <ReferenceLine
            x={todayRow.date}
            stroke={BRAND_CYAN}
            strokeDasharray="3 3"
            label={{
              value: "today",
              position: "top",
              fill: BRAND_CYAN,
              fontSize: 11
            }}
          />
        )}
        {todayRow && (
          <ReferenceDot
            x={todayRow.date}
            y={todayRow.Balance}
            r={4}
            fill={BRAND_CYAN}
            stroke={BRAND_CYAN}
          />
        )}
        <Line
          type="monotone"
          dataKey="Balance"
          stroke={BRAND_PURPLE}
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Net worth forecast — two lines: liquid (muted) + net worth (cyan)
// ────────────────────────────────────────────────────────────────────────────

export function NetWorthForecastChart({
  data,
  currency
}: {
  data: { month: string; liquidBaseCurrency: string; netWorthBaseCurrency: string }[];
  currency: string;
}) {
  const rows = data.map((p) => ({
    month: p.month,
    Liquid: Number(p.liquidBaseCurrency),
    "Net worth": Number(p.netWorthBaseCurrency)
  }));
  if (rows.length === 0) return null;
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={rows}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
        <XAxis
          dataKey="month"
          tick={AXIS_TICK_SM}
          interval="preserveStartEnd"
          minTickGap={32}
        />
        <YAxis
          tick={AXIS_TICK}
          tickFormatter={(v: number) => fmtMoney(v, currency)}
          width={100}
        />
        <Tooltip
          formatter={(v: number) => fmtMoney(v, currency)}
          contentStyle={tooltipStyle()}
          labelStyle={TOOLTIP_LABEL_STYLE}
          itemStyle={TOOLTIP_ITEM_STYLE}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {/* Liquid = muted baseline */}
        <Line
          type="monotone"
          dataKey="Liquid"
          stroke={BRAND_MUTED}
          strokeWidth={2}
          dot={false}
        />
        {/* Net worth = brand cyan (total wealth) */}
        <Line
          type="monotone"
          dataKey="Net worth"
          stroke={BRAND_CYAN}
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Investment projection — three lines: contributions, nominal, real
// ────────────────────────────────────────────────────────────────────────────

export function InvestmentProjectionChart({
  data,
  currency
}: {
  data: {
    year: number;
    contributions: string;
    nominal: string;
    real: string;
  }[];
  currency: string;
}) {
  const rows = data.map((p) => ({
    year: p.year,
    Contributions: Number(p.contributions),
    Nominal: Number(p.nominal),
    Real: Number(p.real)
  }));
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={rows}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
        <XAxis dataKey="year" tick={AXIS_TICK} />
        <YAxis
          tick={AXIS_TICK}
          tickFormatter={(v: number) => fmtMoney(v, currency)}
          width={100}
        />
        <Tooltip
          formatter={(v: number) => fmtMoney(v, currency)}
          contentStyle={tooltipStyle()}
          labelStyle={TOOLTIP_LABEL_STYLE}
          itemStyle={TOOLTIP_ITEM_STYLE}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {/* Contributions — muted baseline (what you put in) */}
        <Line
          type="monotone"
          dataKey="Contributions"
          stroke={BRAND_MUTED}
          strokeWidth={2}
          dot={false}
          strokeDasharray="4 2"
        />
        {/* Real — brand cyan (inflation-adjusted, conservative) */}
        <Line
          type="monotone"
          dataKey="Real"
          stroke={BRAND_CYAN}
          strokeWidth={2}
          dot={false}
        />
        {/* Nominal — brand purple (total projected value) */}
        <Line
          type="monotone"
          dataKey="Nominal"
          stroke={BRAND_PURPLE}
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
