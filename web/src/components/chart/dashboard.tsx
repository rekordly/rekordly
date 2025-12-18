import React from 'react';
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { formatCurrency } from '@/lib/fn';

interface RevenueData {
  month: string;
  Income: number;
  Expenses: number;
}

interface CategoryData {
  name: string;
  value: number;
  color?: string;
  percentage?: number;
  [key: string]: string | number | boolean | undefined;
}

interface RevenueChartProps {
  data: RevenueData[];
}

interface CategoryPieChartProps {
  data: CategoryData[];
  type?: 'income' | 'expense';
}

// Color palette for income pie chart (purple/blue/green tones)
const INCOME_COLORS = [
  '#8B5CF6',
  '#3B82F6',
  '#10B981',
  '#F59E0B',
  '#EC4899',
  '#14B8A6',
  '#6366F1',
];

// Color palette for expense pie chart (red/orange tones)
const EXPENSE_COLORS = [
  '#EF4444',
  '#DC2626',
  '#F97316',
  '#EA580C',
  '#FB923C',
  '#F87171',
  '#FCA5A5',
];

export const RevenueChart = ({ data }: RevenueChartProps) => {
  // Check if data is empty or null
  if (!data || data.length === 0) {
    return (
      <div className="h-87.5 flex items-center justify-center">
        <p className="text-sm text-default-500">No revenue data available</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer height={350} width="100%">
      <LineChart data={data}>
        <defs>
          <linearGradient id="colorIncome" x1="0" x2="0" y1="0" y2="1">
            <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="colorExpenses" x1="0" x2="0" y1="0" y2="1">
            <stop offset="5%" stopColor="#EF4444" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="month" fontSize={10} stroke="#6B7280" />
        <YAxis fontSize={10} stroke="#6B7280" />
        <Tooltip
          contentStyle={{
            backgroundColor: '#FFF',
            border: '1px solid #E5E7EB',
            borderRadius: '8px',
            fontSize: '12px',
          }}
        />
        <Line
          dataKey="Income"
          fill="url(#colorIncome)"
          fillOpacity={1}
          stroke="#8B5CF6"
          strokeWidth={2}
          type="monotone"
        />
        <Line
          dataKey="Expenses"
          fill="url(#colorExpenses)"
          fillOpacity={1}
          stroke="#EF4444"
          strokeWidth={2}
          type="monotone"
        />
      </LineChart>
    </ResponsiveContainer>
  );
};

export const CategoryPieChart = ({
  data,
  type = 'income',
}: CategoryPieChartProps) => {
  // Check if data is empty or null
  if (!data || data.length === 0) {
    return (
      <div className="h-62.5 flex items-center justify-center">
        <p className="text-sm text-default-500">
          No {type} category data available
        </p>
      </div>
    );
  }

  // Select color palette based on type
  const colors = type === 'expense' ? EXPENSE_COLORS : INCOME_COLORS;

  // Add colors to data if not present
  const dataWithColors = data.map((entry, index) => ({
    ...entry,
    color: entry.color || colors[index % colors.length],
  }));

  return (
    <div className="space-y-4">
      <ResponsiveContainer height={250} width="100%">
        <PieChart>
          <Pie
            cx="50%"
            cy="50%"
            data={dataWithColors}
            dataKey="value"
            innerRadius={60}
            outerRadius={80}
            paddingAngle={2}
          >
            {dataWithColors.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number | undefined) =>
              formatCurrency(value || 0)
            }
            contentStyle={{
              backgroundColor: '#FFF',
              border: '1px solid #E5E7EB',
              borderRadius: '8px',
              fontSize: '12px',
            }}
          />
        </PieChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-3 px-4">
        {dataWithColors.map((entry, index) => (
          <div key={index} className="flex  gap-2">
            <div
              className="w-3 h-3 mt-1 rounded-full shrink-0"
              style={{ backgroundColor: entry.color }}
            />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground truncate">
                {entry.name}
              </p>
              <p className="text-[0.6rem] text-default-500">
                {entry.percentage ? `${entry.percentage.toFixed(1)}%` : ''}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
