'use client';

import { useState, useEffect } from 'react';
import { Card, CardBody } from '@heroui/card';
import { Button } from '@heroui/button';
import { Chip } from '@heroui/chip';
import {
  Receipt,
  TrendingUp,
  Shield,
  CheckCircle2,
  Download,
  Calendar,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

import { features, pricingPlans } from '@/config/constant';

export default function RekordlyLanding() {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };

    window.addEventListener('scroll', handleScroll);

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <main className="min-h-screen bg-background">
      {/* Dynamic Navbar */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          isScrolled ? 'bg-background/80 backdrop-blur-md' : 'bg-transparent'
        }`}
      >
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 bg-gradient-to-br from-primary-400 to-primary-600 rounded-lg flex items-center justify-center">
                <Receipt className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold  tracking-tight">
                Rekordly
              </span>
            </div>

            <div className="hidden md:flex items-center gap-8">
              <a
                className="text-sm text-default-500  hover:text-default-900 transition-colors"
                href="#features"
              >
                Features
              </a>
              <a
                className="text-sm text-default-500  hover:text-default-900 transition-colors"
                href="#how-it-works"
              >
                How It Works
              </a>
              <a
                className="text-sm text-default-500  hover:text-default-900 transition-colors"
                href="#pricing"
              >
                Pricing
              </a>
            </div>

            <Button className="bg-gradient-to-r from-primary-400 to-primary-600 text-white font-medium text-sm">
              Get Started Free
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section - Clean mesh gradient */}
      <section className="relative overflow-hidden bg-gradient-to-br from-background via-background to-background">
        {/* Subtle mesh gradient background */}
        {/* <div className="absolute inset-0 opacity-40">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary-400/20 rounded-full mix-blend-multiply filter blur-3xl animate-pulse" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-primary-600/20 rounded-full mix-blend-multiply filter blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        </div> */}

        <div className="relative max-w-7xl mx-auto px-6 pt-36 pb-20">
          <div className="text-center max-w-4xl mx-auto">
            <Chip
              className="mb-6 bg-primary-400/10 border border-primary-400/20 text-primary-200 text-xs font-medium"
              startContent={<Sparkles className="w-3.5 h-3.5 ps-1" />}
            >
              Built for Nigerian Businesses
            </Chip>

            <h1 className="text-5xl md:text-7xl font-bold font-heading text-foreground mb-4 leading-[1.2] tracking-tight">
              Your Financial Records,
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-400 to-primary-600">
                Simplified & Automated
              </span>
            </h1>

            <p className="text-base lg:text-lg text-center text-gray-600 mb-10 max-w-2xl mx-auto ">
              Track income, manage expenses, and generate tax-ready reports —
              all in one place. Built specifically for business owners,
              freelancers, and the self-employed in Nigeria
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button
                className="bg-gradient-to-r from-primary-400 to-primary-700 text-white font-semibold px-8"
                endContent={<ArrowRight className="w-4 h-4" />}
                size="lg"
              >
                Start Free Trial
              </Button>
              <Button
                className=" font-semibold px-8"
                color="primary"
                size="lg"
                variant="bordered"
              >
                Watch Demo
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Dashboard Preview - Plain Background */}
      <section className="">
        <div className="max-w-7xl mx-auto px-6">
          <Card className="bg-gradient-to-br  from-primary-200 to-primary-300 border border-gray-200  overflow-hidden">
            <CardBody className="p-8 md:p-12">
              <div className="grid md:grid-cols-2 gap-8">
                {/* Left - Transaction List Preview */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-bold text-white">
                      Recent Transactions
                    </h3>
                    <Chip
                      className="bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 text-xs"
                      size="sm"
                    >
                      +12% this month
                    </Chip>
                  </div>

                  {[
                    {
                      type: 'Product Sales',
                      amount: '+₦45,000',
                      time: '2 hours ago',
                      trend: 'up',
                    },
                    {
                      type: 'Office Rent',
                      amount: '-₦180,000',
                      time: '1 day ago',
                      trend: 'down',
                    },
                    {
                      type: 'Client Payment',
                      amount: '+₦92,500',
                      time: '2 days ago',
                      trend: 'up',
                    },
                    {
                      type: 'Office Supplies',
                      amount: '-₦15,200',
                      time: '3 days ago',
                      trend: 'down',
                    },
                  ].map((txn, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-4 bg-white  rounded-xl border border-gray-200"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center ${
                            txn.trend === 'up' ? 'bg-green-100' : 'bg-red-100'
                          }`}
                        >
                          {txn.trend === 'up' ? (
                            <TrendingUp className="w-5 h-5 text-green-600" />
                          ) : (
                            <Receipt className="w-5 h-5 text-red-600 " />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-black text-sm">
                            {txn.type}
                          </p>
                          <p className="text-xs font-light text-gray-500">
                            {txn.time}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`font-bold text-sm ${
                          txn.trend === 'up'
                            ? 'text-green-600'
                            : 'text-red-600 '
                        }`}
                      >
                        {txn.amount}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Right - Summary Card */}
                <div className="space-y-4">
                  <Card className="bg-gradient-to-br from-secondary-800 to-secondary-600 border-0">
                    <CardBody className="p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-white font-semibold text-sm">
                          Monthly Summary
                        </h4>
                        <Calendar className="w-4 h-4 text-white/80" />
                      </div>

                      <div className="space-y-4">
                        <div>
                          <p className="text-white/70 text-xs mb-1">
                            Total Income
                          </p>
                          <p className="text-3xl font-bold text-white">
                            ₦842,500
                          </p>
                        </div>

                        <div className="h-px bg-white/20" />

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-white/70 text-xs mb-1">
                              Expenses
                            </p>
                            <p className="text-lg font-bold text-white">
                              ₦295,200
                            </p>
                          </div>
                          <div>
                            <p className="text-white/70 text-xs mb-1">
                              Net Profit
                            </p>
                            <p className="text-lg font-bold text-white">
                              ₦547,300
                            </p>
                          </div>
                        </div>
                      </div>

                      <Button
                        className="w-full mt-6 bg-white text-black font-semibold text-sm"
                        endContent={<Download className="w-4 h-4" />}
                      >
                        Download Report
                      </Button>
                    </CardBody>
                  </Card>

                  <Card className="bg-white border-gray-200">
                    <CardBody className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-gray-600 dark:text-gray-400 text-xs mb-1">
                            Estimated Tax
                          </p>
                          <p className="text-2xl font-bold text-gray-900 dark:text-white">
                            ₦54,730
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                            Based on 10% rate
                          </p>
                        </div>
                        <div className="w-12 h-12 bg-[#6366F1]/10 rounded-full flex items-center justify-center">
                          <Shield className="w-6 h-6 text-[#6366F1]" />
                        </div>
                      </div>
                    </CardBody>
                  </Card>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>
      </section>

      {/* Features Section - Two-tone gradient */}
      <section
        className="py-24 bg-gradient-to-br from-[#F8F9FF] to-[#FFF5F7] dark:from-[#0F0F14] dark:to-[#0A0A0A]"
        id="features"
      >
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <Chip className="mb-4 bg-[#6366F1]/10 border border-[#6366F1]/20 text-[#6366F1] text-xs font-medium">
              Powerful Features
            </Chip>
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-4 tracking-tight leading-tight">
              Everything you need to stay
              <br />
              financially organized
            </h2>
            <p className="text-base text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              Designed specifically for Nigerian businesses, freelancers, and
              self-employed professionals
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {features.map((feature, idx) => (
              <Card
                key={idx}
                className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-[#6366F1]/50 transition-all"
              >
                <CardBody className="p-6">
                  <div className="w-12 h-12 bg-gradient-to-br from-[#6366F1] to-[#8B5CF6] rounded-xl flex items-center justify-center mb-4">
                    <feature.icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                    {feature.description}
                  </p>
                </CardBody>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works - Plain Background */}
      <section className="py-24 bg-white dark:bg-[#0A0A0A]" id="how-it-works">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-4 tracking-tight">
              How It Works
            </h2>
            <p className="text-base text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              Get started in minutes with our simple three-step process
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: '01',
                title: 'Create Your Account',
                description:
                  'Sign up in seconds and tell us about your business type — registered business, freelancer, or self-employed.',
                color: 'from-[#6366F1] to-[#8B5CF6]',
              },
              {
                step: '02',
                title: 'Record Transactions',
                description:
                  'Add your income, sales, and expenses as they happen. Categorize them automatically for easy tracking.',
                color: 'from-[#F59E0B] to-[#EF4444]',
              },
              {
                step: '03',
                title: 'Generate Reports',
                description:
                  'Get instant financial summaries, tax estimates, and downloadable reports whenever you need them.',
                color: 'from-[#10B981] to-[#06B6D4]',
              },
            ].map((item, idx) => (
              <Card
                key={idx}
                className={`bg-gradient-to-br ${item.color} border-0`}
              >
                <CardBody className="p-8">
                  <div className="text-5xl font-bold text-white/30 mb-4">
                    {item.step}
                  </div>
                  <h3 className="text-xl font-bold text-white mb-3">
                    {item.title}
                  </h3>
                  <p className="text-white/90 text-sm leading-relaxed">
                    {item.description}
                  </p>
                </CardBody>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section - Two-tone gradient */}
      <section
        className="py-24 bg-gradient-to-br from-[#FFF5F7] to-[#F8F9FF] dark:from-[#0A0A0A] dark:to-[#0F0F14]"
        id="pricing"
      >
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <Chip className="mb-4 bg-[#6366F1]/10 border border-[#6366F1]/20 text-[#6366F1] text-xs font-medium">
              Pricing Plans
            </Chip>
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-4 tracking-tight">
              Find the Right Plan
              <br />
              for Your Business
            </h2>
            <p className="text-base text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              Flexible pricing options designed to grow with your business needs
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {pricingPlans.map((plan, idx) => (
              <Card
                key={idx}
                className={`${
                  plan.highlighted
                    ? 'bg-gradient-to-br from-[#6366F1] to-[#8B5CF6] border-0 scale-105'
                    : 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800'
                }`}
              >
                <CardBody className="p-8">
                  <div className="mb-6">
                    <h3
                      className={`text-xl font-bold mb-2 ${plan.highlighted ? 'text-white' : 'text-gray-900 dark:text-white'}`}
                    >
                      {plan.name}
                    </h3>
                    <p
                      className={`text-sm ${plan.highlighted ? 'text-white/80' : 'text-gray-600 dark:text-gray-400'}`}
                    >
                      {plan.description}
                    </p>
                  </div>

                  <div className="mb-6">
                    <div className="flex items-baseline gap-1">
                      <span
                        className={`text-4xl font-bold ${plan.highlighted ? 'text-white' : 'text-gray-900 dark:text-white'}`}
                      >
                        {plan.price}
                      </span>
                      <span
                        className={`text-sm ${plan.highlighted ? 'text-white/80' : 'text-gray-600 dark:text-gray-400'}`}
                      >
                        {plan.period}
                      </span>
                    </div>
                  </div>

                  <Button
                    className={`w-full mb-6 font-semibold ${
                      plan.highlighted
                        ? 'bg-white text-[#6366F1]'
                        : 'bg-gradient-to-r from-[#6366F1] to-[#8B5CF6] text-white'
                    }`}
                  >
                    {plan.highlighted ? 'Start Free Trial' : 'Get Started'}
                  </Button>

                  <div className="space-y-3">
                    <p
                      className={`text-xs font-semibold uppercase tracking-wide ${
                        plan.highlighted
                          ? 'text-white/80'
                          : 'text-gray-500 dark:text-gray-400'
                      }`}
                    >
                      Features
                    </p>
                    {plan.features.map((feature, featureIdx) => (
                      <div key={featureIdx} className="flex items-start gap-2">
                        <CheckCircle2
                          className={`w-4 h-4 mt-0.5 shrink-0 ${
                            plan.highlighted ? 'text-white' : 'text-[#6366F1]'
                          }`}
                        />
                        <span
                          className={`text-sm ${
                            plan.highlighted
                              ? 'text-white/90'
                              : 'text-gray-700 dark:text-gray-300'
                          }`}
                        >
                          {feature}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section - Plain Background */}
      <section className="py-24 bg-white dark:bg-[#0A0A0A]">
        <div className="max-w-4xl mx-auto px-6">
          <Card className="bg-gradient-to-br from-[#6366F1] to-[#8B5CF6] border-0 overflow-hidden">
            <CardBody className="p-12 md:p-16 text-center relative">
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent" />
              <div className="relative">
                <h2 className="text-4xl md:text-5xl font-bold text-white mb-4 tracking-tight">
                  Ready to get organized?
                </h2>
                <p className="text-lg text-white/90 mb-8 max-w-xl mx-auto">
                  Join thousands of Nigerian businesses already using Rekordly
                  to simplify their finances
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-6">
                  <Button
                    className="bg-white text-[#6366F1] font-bold px-8"
                    endContent={<ArrowRight className="w-4 h-4" />}
                    size="lg"
                  >
                    Start Free Trial
                  </Button>
                  <Button
                    className="border-white text-white font-bold px-8 hover:bg-white/10"
                    size="lg"
                    variant="bordered"
                  >
                    Schedule Demo
                  </Button>
                </div>
                <p className="text-white/80 text-xs">
                  No credit card required • Free 14-day trial • Cancel anytime
                </p>
              </div>
            </CardBody>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 dark:border-gray-800 py-12 bg-white dark:bg-[#0A0A0A]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-gradient-to-br from-[#6366F1] to-[#8B5CF6] rounded-lg flex items-center justify-center">
                  <Receipt className="w-5 h-5 text-white" />
                </div>
                <span className="text-lg font-bold text-gray-900 dark:text-white tracking-tight">
                  Rekordly
                </span>
              </div>
              <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                Simplifying financial record keeping for Nigerian businesses.
              </p>
            </div>

            <div>
              <h4 className="font-semibold text-gray-900 dark:text-white mb-4 text-sm">
                Product
              </h4>
              <ul className="space-y-2 text-gray-600 dark:text-gray-400 text-sm">
                <li>
                  <a
                    className="hover:text-[#6366F1] transition-colors"
                    href="#features"
                  >
                    Features
                  </a>
                </li>
                <li>
                  <a
                    className="hover:text-[#6366F1] transition-colors"
                    href="#pricing"
                  >
                    Pricing
                  </a>
                </li>
                <li>
                  <a
                    className="hover:text-[#6366F1] transition-colors"
                    href="#"
                  >
                    Security
                  </a>
                </li>
                <li>
                  <a
                    className="hover:text-[#6366F1] transition-colors"
                    href="#"
                  >
                    Updates
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-gray-900 dark:text-white mb-4 text-sm">
                Company
              </h4>
              <ul className="space-y-2 text-gray-600 dark:text-gray-400 text-sm">
                <li>
                  <a
                    className="hover:text-[#6366F1] transition-colors"
                    href="#"
                  >
                    About Us
                  </a>
                </li>
                <li>
                  <a
                    className="hover:text-[#6366F1] transition-colors"
                    href="#"
                  >
                    Blog
                  </a>
                </li>
                <li>
                  <a
                    className="hover:text-[#6366F1] transition-colors"
                    href="#"
                  >
                    Careers
                  </a>
                </li>
                <li>
                  <a
                    className="hover:text-[#6366F1] transition-colors"
                    href="#"
                  >
                    Contact
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-gray-900 dark:text-white mb-4 text-sm">
                Legal
              </h4>
              <ul className="space-y-2 text-gray-600 dark:text-gray-400 text-sm">
                <li>
                  <a
                    className="hover:text-[#6366F1] transition-colors"
                    href="#"
                  >
                    Privacy Policy
                  </a>
                </li>
                <li>
                  <a
                    className="hover:text-[#6366F1] transition-colors"
                    href="#"
                  >
                    Terms of Service
                  </a>
                </li>
                <li>
                  <a
                    className="hover:text-[#6366F1] transition-colors"
                    href="#"
                  >
                    Cookie Policy
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-gray-200 dark:border-gray-800 pt-8 text-center text-gray-600 dark:text-gray-400 text-xs">
            © 2025 Rekordly. All rights reserved. Made with ❤️ in Nigeria.
          </div>
        </div>
      </footer>
    </main>
  );
}
