"use client";

import Navbar from "@/components/layout/Navbar";
import {Image} from "@heroui/image";
import {Button} from "@heroui/button"
import {Chip} from "@heroui/chip";
import {Card, CardHeader, CardBody, CardFooter} from "@heroui/card";
import { PlayCircle, TrendingUp, TrendingDown, BarChart3, Receipt, FileText, Calculator,  Shield, Users, CheckCircle2  } from "lucide-react";

export default function Home() {

  const marketData = [
    { symbol: 'SALES', description: 'Product Sales', price: '$1,800', trend: 'up' },
    { symbol: 'EXPENSES', description: 'Operating Costs', price: '$105', trend: 'down' },
    { symbol: 'SERVICES', description: 'Service Revenue', price: '$4.50', trend: 'up' },
    { symbol: 'SUPPLIES', description: 'Inventory', price: '$1,800', trend: 'up' },
    { symbol: 'UTILITIES', description: 'Monthly Bills', price: '$105', trend: 'down' },
  ];

  const quickContacts = [
    { name: 'Sarah Miller', role: 'Client', color: 'bg-purple-600' },
    { name: 'John Davis', role: 'Vendor', color: 'bg-purple-500' },
  ];

  const floatingBadges = [
    { name: 'Mike Rubin', handle: '@mikeybiz', position: 'top-32 left-32' },
    { name: 'ED Hurton', handle: '@edhurton', position: 'top-6 right-72' },
    { name: 'Peter Ruben', handle: '@peteruben', position: 'top-48 right-36' },
    { name: 'Importing', handle: 'US-NG-UK', position: 'top-64 left-72' },
  ];

  const features = [
    {
      icon: Shield,
      title: 'Safe and secure environment.',
      description: 'Smart Recommendations: Get tailored recommendations based on your trade interests and preferences, recommendations based on your trade interests. 🔥'
    },
    {
      icon: TrendingUp,
      title: 'Track every transaction.',
      description: 'Comprehensive Tracking: Monitor all your business transactions in one place, with detailed categorization for easy tax reporting and financial insights. 📊'
    },
    {
      icon: Users,
      title: 'Collaborate with your team.',
      description: 'Team Management: Add team members, assign roles, and manage permissions to keep everyone on the same page with real-time updates. 👥'
    }
  ];

  return (
    <main>
      <section className="min-h-screen relative">
        {/* Background effects */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="pointer-events-none absolute w-84 h-84 rounded-full opacity-10 dark:opacity-20 blur-3xl bg-brand -right-6 -top-28" />
          <div className="hidden lg:block pointer-events-none absolute w-48 h-48 rounded-full opacity-10 dark:opacity-10 blur-3xl bg-brand left-12 top-48" />
        </div>

        {/* Navbar on top of background */}
        <div className="relative z-10">
          <Navbar />
        </div>
        
        {/* Your content */} 
        <div className="relative z-0 w-full max-w-8xl py-20">


          {/* Floating user badges */}
          {floatingBadges.map((badge, idx) => (
            <div
              key={idx}
              className={`hidden lg:flex absolute ${badge.position} items-center gap-3 bg-background/50 backdrop-blur-md border border-brand/50 rounded-full px-4 py-2 animate-pulse`}
            >
              <div className="w-10 h-10 bg-gradient-to-br from-brand-600 to-brand-400 rounded-full flex items-center justify-center">
                <Receipt className="w-5 h-5 text-forewhiteground" />
              </div>
              <div>
                <p className="text-foreground text-sm font-medium">{badge.name}</p>
                <p className="text-default-400 text-xs">{badge.handle}</p>
              </div>
            </div>
          ))}

          <div className="relative z-10 max-w-7xl mx-auto md:py-8">
            {/* Hero Text */}
            <div className="text-center mb-16 max-w-4xl mx-auto px-4 md:px-0">
              <h1 className="text-5xl md:text-5xl font-semibold text-foreground mb-4 md:mb-6">
                Bridging the networking{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-400 to-brand-600">
                  gap
                </span>
                <br />
                in international trade
              </h1>
              <p className="text-default-400 text-base md:text-base font-light max-w-md md:max-w-lg mx-auto">
                Be the First to Experience a Platform built specially for Fostering Continental Relations in Trade
              </p>
            </div>

            {/* Feature Cards */}
            <div className="grid md:grid-cols-3 gap-6 mt-16 px-6 md:px-0 ">
              {/* Market Trend Card */}
              <Card shadow="none" className="bg-transparent border border-brand/30 rounded-3xl">
                <CardBody className="p-8">
                  <div className="flex items-center w-full justify-between mb-8">
                    <Chip
                      variant="flat"
                      className="bg-transparent border border-foreground p-6 text-foreground mx-auto"
                      startContent={<BarChart3 className="w-4 h-4" />}
                    >
                      Market Trend
                    </Chip>
                  </div>

                  <div className="space-y-4">
                    <div className="flex justify-between text-xs font-light text-default-400 mb-4">
                      <span>Symbols</span>
                      <span>Market Price</span>
                    </div>
                    {marketData.map((item, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between mb-2 last:border-0"
                      >
                        <div className="flex gap-2 items-center">
                          <p className="text-foreground text-sm">{item.symbol}</p>
                          <p className="text-default-500 text-xs">{item.description}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-semibold text-sm ${
                              item.trend === 'up' ? 'text-green-500' : 'text-red-500'
                            }`}
                          >
                            {item.price}
                          </span>
                          {item.trend === 'up' ? (
                            <TrendingUp className="w-4 h-4 text-green-500" />
                          ) : (
                            <TrendingDown className="w-4 h-4 text-red-500" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardBody>
              </Card>


            </div>

          </div>
        </div>

      </section>  
      <section className="max-w-6xl mx-auto pb-20 relative px-6 md:px-0">
        {/* Background effects */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="hidden lg:block pointer-events-none absolute w-64 h-64 rounded-full opacity-10 dark:opacity-10 blur-3xl bg-brand left-20 top-36" />
        </div>

        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left side - Features list */}
          <div className="space-y-8">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground leading-tight">
              Decentralized all-in-one community platform.
            </h2>

            <div className="space-y-4">
              {features.map((feature, idx) => (
                <div key={idx} className="space-y-0">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-brand/20 flex items-center justify-center">
                      <CheckCircle2 className="w-5 h-5 text-brand" />
                    </div>
                    <h3 className="text-foreground text-lg font-semibold">
                      {feature.title}
                    </h3>
                  </div>
                  <p className="text-default-400 text-sm leading-relaxed pl-11">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Right side - Card Stack */}
          <div className="relative flex justify-center lg:justify-end">
            {/* Stacked cards effect */}
            <div className="relative w-full max-w-md">
              {/* Back cards */}
              <div className="absolute top-6 left-4 w-full h-96 bg-brand/30 rounded-3xl " />
              <div className="absolute top-3 left-2 w-full h-96 bg-brand/50 rounded-3xl " />
              
              {/* Main card */}
              <Card className="relative bg-gradient-to-br from-brand to-brand/80 border-0 shadow-2xl">
                <CardBody className="p-8 space-y-2">
                  <div>
                    <h3 className="text-foreground text-3xl font-bold mb-2">
                      Secured Connections
                    </h3>
                  </div>

                  <div>
                    <h4 className="text-foreground text-lg font-semibold mb-2">
                      One platform for all your trading needs
                    </h4>
                    <p className="text-default-900/80 text-sm leading-relaxed">
                      We're innovations, driven by visionary technology, and fueled by a vibrant community of passionate dealers and traders.
                    </p>
                  </div>

                  {/* Inner white card with stats */}
                  <Card className="bg-brand-200 border-0 shadow-lg mt-6">
                    <CardBody className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-6xl font-bold text-default-900">17</span>
                            <Chip 
                              size="sm" 
                              className="bg-green-500 text-default-900 font-semibold"
                            >
                              New
                            </Chip>
                          </div>
                          <p className="text-default-700 text-sm font-medium">
                            New Connects
                          </p>
                        </div>

                        <button className="w-12 h-12 bg-default-900 rounded-full flex items-center justify-center hover:scale-110 transition-transform">
                          <Users className="w-6 h-6 text-default-300" />
                        </button>
                      </div>
                    </CardBody>
                  </Card>
                </CardBody>
              </Card>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}