"use client"
import React, { useState } from 'react';
import { Card, CardBody, CardHeader } from '@heroui/card';
import { Button } from '@heroui/button';
import { Chip } from '@heroui/chip';
import { Select, SelectItem } from '@heroui/select';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  ShoppingCart, 
  CreditCard,
  Receipt,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  Calendar
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';

// Mock data for demonstration
const revenueData = [
  { month: 'Jan', Income: 45000, Expenses: 28000 },
  { month: 'Feb', Income: 52000, Expenses: 31000 },
  { month: 'Mar', Income: 48000, Expenses: 29000 },
  { month: 'Apr', Income: 61000, Expenses: 35000 },
  { month: 'May', Income: 55000, Expenses: 32000 },
  { month: 'Jun', Income: 67000, Expenses: 38000 },
  { month: 'Jul', Income: 72000, Expenses: 40000 },
  { month: 'Aug', Income: 69000, Expenses: 37000 },
  { month: 'Sep', Income: 75000, Expenses: 42000 },
  { month: 'Oct', Income: 80000, Expenses: 45000 },
  { month: 'Nov', Income: 85000, Expenses: 47000 },
  { month: 'Dec', Income: 90000, Expenses: 50000 },
];

const categoryData = [
  { name: 'Sales', value: 45, color: '#8B5CF6' },
  { name: 'Services', value: 30, color: '#3B82F6' },
  { name: 'Products', value: 15, color: '#10B981' },
  { name: 'Other', value: 10, color: '#F59E0B' },
];

const recentTransactions = [
  { id: 1, type: 'income', description: 'Client Payment - Project X', amount: 5000, date: '2 hours ago', category: 'Sales' },
  { id: 2, type: 'expense', description: 'Office Supplies', amount: 250, date: '5 hours ago', category: 'Expenses' },
  { id: 3, type: 'income', description: 'Consulting Fee', amount: 3500, date: '1 day ago', category: 'Services' },
  { id: 4, type: 'expense', description: 'Software Subscription', amount: 99, date: '1 day ago', category: 'Expenses' },
  { id: 5, type: 'income', description: 'Product Sale', amount: 1200, date: '2 days ago', category: 'Sales' },
];

// Reusable Chart Components
const RevenueChart = ({ data }) => (
  <ResponsiveContainer width="100%" height={350}>
    <LineChart data={data}>
      <defs>
        <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3}/>
          <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0}/>
        </linearGradient>
        <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor="#EF4444" stopOpacity={0.3}/>
          <stop offset="95%" stopColor="#EF4444" stopOpacity={0}/>
        </linearGradient>
      </defs>
      {/* <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" /> */}
      <XAxis dataKey="month" stroke="#6B7280" fontSize={10} />
      <YAxis stroke="#6B7280" fontSize={10} />
      <Tooltip 
        contentStyle={{ 
          backgroundColor: '#FFF', 
          border: '1px solid #E5E7EB',
          borderRadius: '8px',
          fontSize: '12px'
        }}
      />
      <Line 
        type="monotone" 
        dataKey="Income" 
        stroke="#8B5CF6" 
        strokeWidth={2}
        fillOpacity={1} 
        fill="url(#colorIncome)" 
      />
      <Line 
        type="monotone" 
        dataKey="Expenses" 
        stroke="#EF4444" 
        strokeWidth={2}
        fillOpacity={1} 
        fill="url(#colorExpenses)" 
      />
    </LineChart>
  </ResponsiveContainer>
);

const CategoryPieChart = ({ data }) => (
  <ResponsiveContainer width="100%" height={250}>
    <PieChart>
      <Pie
        data={data}
        cx="50%"
        cy="50%"
        innerRadius={60}
        outerRadius={80}
        paddingAngle={2}
        dataKey="value"
      >
        {data.map((entry, index) => (
          <Cell key={`cell-${index}`} fill={entry.color} />
        ))}
      </Pie>
      <Tooltip />
    </PieChart>
  </ResponsiveContainer>
);


// Main Dashboard Component
export default function Dashboard() {

  return (
    <div className="min-h-screen px-0 ">
      
      <div className="space-y-6">

        <div className='grid grid-cols-1 md:grid-cols-3 gap-3'>
          <Card className="bg-gradient-to-b p-3 dark:from-primary-800/40 from-0% via-50% dark:to-[#131219] from-primary-100/25 to-white to-90% relative rounded-3xl" shadow='none'>
            <CardHeader>
              <Chip className='p-3 uppercase' size='sm' variant='flat' color='primary'>Total Income</Chip>
            </CardHeader>
            <CardBody className='py-6 md:pt-8'>
              <div className='flex md:justify-between flex-row-reverse gap-4'>
                
                <div className='flex-3/12 mb-2 md:mb-0'>
                  <Chip 
                    variant='shadow' 
                    color='primary' 
                    size='lg' 
                    className='item-center size-16 rounded-2xl'
                  ><DollarSign size={'24'} /></Chip>
                </div>
                
                <div>
                  <h2 className='font-heading tracking-tight font-bold text-2xl'>₦703,492.29</h2>
                  <p className='text-xs font-light'>Lorem ipsum dolor sit amet consectetur, adipisicing elit. Error, temporibus in ex accusantium asperiores eius</p>
                </div>
              </div>
            </CardBody>
          </Card>

          <Card className="bg-gradient-to-b p-3 dark:from-secondary-800/40 from-0% via-50% dark:to-[#131219] from-secondary-100/25 to-white to-90% relative rounded-3xl" shadow='none'>
            <CardHeader>
              <Chip className='p-3 uppercase' size='sm' variant='flat' color='secondary'>Total Income</Chip>
            </CardHeader>
            <CardBody className='py-6 md:pt-8'>
              <div className='flex md:justify-between flex-row-reverse gap-4'>
                
                <div className='flex-3/12 mb-2 md:mb-0'>
                  <Chip 
                    variant='shadow' 
                    color='secondary' 
                    size='lg' 
                    className='item-center size-16 rounded-2xl'
                  ><DollarSign size={'24'} /></Chip>
                </div>
                
                <div>
                  <h2 className='font-heading tracking-tight font-bold text-2xl'>₦703,492.29</h2>
                  <p className='text-xs font-light'>Lorem ipsum dolor sit amet consectetur, adipisicing elit. Error, temporibus in ex accusantium asperiores eius</p>
                </div>
              </div>
            </CardBody>
          </Card>

        
        </div>


        <div className='flex flex-col md:flex-row-reverse gap-4'>
          <Card className='flex-1 rounded-3xl' shadow='none'>
             <CardHeader className="flex items-center justify-between py-6 px-6">
              <div>
                <h3 className="text-base font-semibold text-foreground font-heading tracking-tight leading-tight">Income by Category</h3>
                <p className="text-xs text-default-500">Revenue Distribtuion</p>
              </div>
            </CardHeader>
            <CardBody>
              <CategoryPieChart data={categoryData} />
            </CardBody>
          </Card>

           <Card className='w-full rounded-3xl md:w-8/12' shadow='none'>
             <CardHeader className="flex items-center justify-between py-6 px-6">
              <div>
                <h3 className="text-base font-semibold text-foreground font-heading tracking-tight leading-tight">Revenue Overview</h3>
                <p className="text-xs text-default-500">Income vs Expenses</p>
              </div>
              {/* <Select
                size="sm"
                selectedKeys={[timePeriod]}
                variant='bordered'
                color='primary'
                className="w-32"
                classNames={{
                  trigger: "h-10 rounded-lg"
                }}
              >
                <SelectItem key="7days">7 Days</SelectItem>
                <SelectItem key="30days">30 Days</SelectItem>
                <SelectItem key="90days">90 Days</SelectItem>
              </Select> */}
            </CardHeader>
            <CardBody>
              <RevenueChart data={revenueData} />
            </CardBody>
          </Card>
        </div>



        {/* Recent Transactions */}
        <Card className="rounded-3xl" shadow='none'>
          <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between pb-0 pt-6 px-6">
            <div>
              <h3 className="text-base font-semibold text-foreground font-heading tracking-tight leading-tight">Recent Transactions</h3>
              <p className="text-xs text-default-500">Your latest business activties</p>
            </div>
            <Button 
              variant="light" 
              color="primary"
              size="sm"
            >
              View All
            </Button>
          </CardHeader>
          <CardBody className="pt-4">
            <div className="space-y-3">
              {recentTransactions.map((transaction) => (
                <div 
                  key={transaction.id}
                  className="flex items-center justify-between p-4 rounded-lg hover:bg-default-100 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className={`p-2 rounded-lg ${
                      transaction.type === 'income' 
                        ? 'bg-success-100 dark:bg-success-950' 
                        : 'bg-danger-100 dark:bg-danger-950'
                    }`}>
                      <Receipt className={`w-5 h-5 ${
                        transaction.type === 'income'
                          ? 'text-success-600 dark:text-success-400'
                          : 'text-danger-600 dark:text-danger-400'
                      }`} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {transaction.description}
                      </p>
                      <p className="text-xs text-default-500">
                        {transaction.category} • {transaction.date}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-bold ${
                      transaction.type === 'income' 
                        ? 'text-success-600' 
                        : 'text-danger-600'
                    }`}>
                      {transaction.type === 'income' ? '+' : '-'}₦{transaction.amount.toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}