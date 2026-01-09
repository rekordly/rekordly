'use client';

import { useState, useEffect } from 'react';
import { Card, CardBody, CardFooter } from '@heroui/card';
import { Button } from '@heroui/button';
import { Chip } from '@heroui/chip';
import { Sparkles } from 'lucide-react';

import {
  features,
  pricingPlans,
  testimonials,
  list,
  overview,
  comparisonData,
  faqs,
} from '@/config/constant';
import {
  FacebookLogo,
  InstagramLogo,
  TwitterLogo,
  Receipt,
  EnvelopeSimple,
  Phone,
  LinkedinLogo,
  ArrowUpRight,
  XCircle,
  CheckCircle,
  CaretCircleDoubleRight,
  Quotes,
  Minus,
  Plus,
} from '@phosphor-icons/react';
import Navbar from '@/components/landingPage/Navbar';
import { Image } from '@heroui/image';
import { Accordion, AccordionItem, Avatar } from '@heroui/react';

export default function RekordlyLanding() {
  const [isScrolled, setIsScrolled] = useState(false);
  const topRowTestimonials = [...testimonials, ...testimonials];
  const bottomRowTestimonials = [
    ...testimonials.slice().reverse(),
    ...testimonials.slice().reverse(),
  ];

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };

    window.addEventListener('scroll', handleScroll);

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <main className="min-h-screen dark bg-brand-background">
      <Navbar />
      <section className="relative max-w-6xl mx-auto overflow-hidden px-4 md:px-6">
        <section className="relative  pt-20 pb-24">
          <div className="text-center max-w-4xl mx-auto">
            <Chip
              className="mb-6 bg-primary-400/10 border border-primary-400/20 text-primary-200 text-xs font-medium"
              startContent={<Sparkles className="w-3.5 h-3.5 ps-1" />}
              variant="shadow"
            >
              Built for Nigerian Businesses
            </Chip>

            <div className="mx-auto md:w-8/12">
              <h1 className="text-4xl md:text-5xl font-heading text-foreground mb-2 leading-none tracking-tight">
                Take control of your{' '}
                <span className="text-transparent font-medium bg-clip-text bg-linear-to-r from-primary-400 to-primary-600">
                  accounts
                </span>{' '}
                - with precision
              </h1>
            </div>

            <div className="mx-auto w-10/12 md:w-6/12">
              <p className="text-sm md:text-base  text-center text-default-600 mb-6 ">
                Professional accounting made simple - track transactions, manage
                ledgers, and generate tax-ready reports
              </p>
            </div>

            <Button
              className="bg-linear-to-r from-primary-300 to-primary-500 text-black  px-6 mb-3"
              endContent={<ArrowUpRight className="w-4 h-4" />}
              radius="full"
              color="primary"
              variant="shadow"
            >
              Get Started for Free
            </Button>
          </div>
          <div className="p-2 md:p-5 relative">
            <Image alt="rekordly-dashboard" src="dashboard-preview.png" />
            <div className="pointer-events-none absolute right-0 bottom-0 w-full z-10 h-7/12 bg-linear-to-t from-brand-background  to-transparent" />
          </div>
        </section>

        {/* How Rekordly works */}
        <section id="how-its-works" className="p-3 md:p-7 py:24 md:py-28">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <CaretCircleDoubleRight
                size={20}
                weight="fill"
                className="text-primary"
              />
              <p className="text-sm font-medium text-primary">Watch Video</p>
            </div>
            <p className="text-foreground font-heading text-2xl md:text-3xl tracking-tighter font-medium">
              How Rekordly Works
            </p>
          </div>

          {/* Card Content */}
          <div className="gap-2 gap-y-4 grid grid-cols-1 sm:grid-cols-3 mt-5">
            {list.map((item, index) => (
              <Card
                key={index}
                isPressable
                shadow="none"
                radius="lg"
                className="flex flex-col"
                onPress={() => console.log('item pressed')}
              >
                <CardBody className="overflow-visible p-2">
                  <div className="overflow-hidden rounded-2xl bg-background">
                    <Image
                      alt={item.title}
                      className="w-full object-cover aspect-square"
                      radius="none"
                      shadow="sm"
                      src={item.img}
                      width="100%"
                    />
                  </div>
                </CardBody>
                <CardFooter className="block text-start p-4">
                  <div className="">
                    <Button
                      className="  border-1px-2 mb-4"
                      radius="sm"
                      color="primary"
                      variant="ghost"
                      size="sm"
                    >
                      {`Step ${item.id}`}
                    </Button>
                    <p className="font-heading leading-none text-lg mb-1.5">
                      {item.title}
                    </p>
                    <p className="text-default-500 text-sm">
                      {item.description}
                    </p>
                  </div>
                </CardFooter>
              </Card>
            ))}
          </div>
        </section>

        {/* Overview */}
        <section id="overview" className="p-3 md:p-14 py-24">
          <div className="md:flex items-center justify-between text-center md:text-start gap-2 mb-1.5">
            <p className="text-foreground font-heading text-4xl md:text-5xl tracking-tighter md:w-5/12 mb-3 md:mb-0">
              See your accounts in real time, clearly
            </p>
            <p className="text-sm mx-auto md:mx-0 md:text-lg text-white w-10/12 md:w-4/12 font-light leading-6">
              Rekordly shows your income, expenses, assets, and liabilities in
              professional accounting formats - right away.
            </p>
          </div>

          {/* Card Content - 12 column grid */}
          <div className=" mt-5">
            {/* Row 1 */}
            <div className="gap-5 grid grid-cols-1 md:grid-cols-5 mb-5">
              <div className="md:col-span-3 w-full">
                <Card
                  isPressable
                  shadow="none"
                  radius="none"
                  className="rounded-4xl w-full h-full p-3"
                >
                  <CardBody className="overflow-visible p-0 w-full">
                    <div className="overflow-hidden rounded-3xl bg-background">
                      <Image
                        alt="General Ledger"
                        className="w-full object-cover h-72"
                        radius="none"
                        shadow="sm"
                        src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800"
                        width="100%"
                      />
                    </div>
                  </CardBody>
                  <CardFooter className="block text-start p-6">
                    <div>
                      <p className="font-heading leading-none text-2xl mb-2">
                        General Ledger
                      </p>
                      <p className="text-default-500 text-base md:w-8/12">
                        Complete double-entry bookkeeping system with automatic
                        debit/credit recording.
                      </p>
                    </div>
                  </CardFooter>
                </Card>
              </div>

              <div className="md:col-span-2">
                <Card
                  isPressable
                  shadow="none"
                  radius="none"
                  className="rounded-4xl h-full"
                >
                  <CardBody className="overflow-visible p-3">
                    <div className="overflow-hidden rounded-3xl bg-background">
                      <Image
                        alt="Trial Balance"
                        className="w-full object-cover h-72"
                        radius="none"
                        shadow="sm"
                        src="https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=800"
                        width="100%"
                      />
                    </div>
                  </CardBody>
                  <CardFooter className="block text-start p-6">
                    <div>
                      <p className="font-heading leading-none text-2xl mb-2">
                        Trial Balance
                      </p>
                      <p className="text-default-500 text-base">
                        Automatically generate balanced trial balances with a
                        single click.
                      </p>
                    </div>
                  </CardFooter>
                </Card>
              </div>
            </div>

            {/* Row 2 */}
            <div className="gap-5 grid grid-cols-1 md:grid-cols-12">
              <div className="md:col-span-4">
                <Card
                  isPressable
                  shadow="none"
                  radius="none"
                  className="rounded-4xl h-full"
                >
                  <CardBody className="overflow-visible p-3">
                    <div className="overflow-hidden rounded-3xl bg-background">
                      <Image
                        alt="Debtors/Creditors"
                        className="w-full object-cover h-72"
                        radius="none"
                        shadow="sm"
                        src="https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800"
                        width="100%"
                      />
                    </div>
                  </CardBody>
                  <CardFooter className="block text-start p-6">
                    <div>
                      <p className="font-heading leading-none text-2xl mb-2">
                        Debtors & Creditors
                      </p>
                      <p className="text-default-500 text-base">
                        Track receivables and payables with automated aging
                        reports.
                      </p>
                    </div>
                  </CardFooter>
                </Card>
              </div>

              <div className="md:col-span-4">
                <Card
                  isPressable
                  shadow="none"
                  radius="none"
                  className="rounded-4xl h-full"
                >
                  <CardBody className="overflow-visible p-3">
                    <div className="overflow-hidden rounded-3xl bg-background">
                      <Image
                        alt="Profit & Loss"
                        className="w-full object-cover h-72"
                        radius="none"
                        shadow="sm"
                        src="https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?w=800"
                        width="100%"
                      />
                    </div>
                  </CardBody>
                  <CardFooter className="block text-start p-6">
                    <div>
                      <p className="font-heading leading-none text-2xl mb-2">
                        Profit & Loss
                      </p>
                      <p className="text-default-500 text-base">
                        Generate comprehensive P&L statements for any period.
                      </p>
                    </div>
                  </CardFooter>
                </Card>
              </div>

              <div className="md:col-span-4 flex flex-col gap-5">
                {/* Special Card 1 (Item 5) */}
                <Card
                  shadow="none"
                  radius="none"
                  className="rounded-4xl p-0 flex-1"
                >
                  <div className="w-full h-full bg-linear-to-br from-primary-500/10 to-primary-600/5 flex flex-col items-center justify-center p-6">
                    <div className="text-center">
                      <p className="text-primary-600 text-sm font-semibold uppercase tracking-wider mb-2">
                        Community Stats
                      </p>
                      <p className="font-heading leading-none text-2xl mb-3">
                        Trusted by 3k+ Businesses
                      </p>
                      <p className="text-default-600 text-sm">
                        Join thousands of Nigerian businesses using our platform
                        for accounting.
                      </p>
                    </div>
                  </div>
                </Card>

                {/* Special Card 2 (Item 6) */}
                <Card
                  shadow="none"
                  radius="none"
                  className="rounded-4xl p-0 flex-1"
                >
                  <div className="w-full h-full bg-linear-to-br from-primary-500/15 to-primary-600/10 flex flex-col items-center justify-center p-6">
                    <div className="text-center">
                      <p className="text-primary-600 text-sm font-semibold uppercase tracking-wider mb-2">
                        Tax Compliance
                      </p>
                      <p className="font-heading leading-none text-2xl mb-3">
                        FIRS-Ready Reports
                      </p>
                      <p className="text-default-600 text-sm">
                        Generate tax-compliant reports for Nigerian tax
                        authorities.
                      </p>
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          </div>
        </section>

        {/* How Rekordly works */}
        <section id="features" className="p-3 md:p-7 py:24 md:py-28">
          <div className="text-center">
            <div className="flex items-center gap-2 mb-1.5 justify-center">
              <CaretCircleDoubleRight
                size={20}
                weight="fill"
                className="text-primary"
              />
              <p className="text-sm md:text-xl font-medium text-primary">
                Features
              </p>
            </div>
            <p className="text-foreground font-heading text-4xl md:text-5xl md:w-8/12 mx-auto tracking-tight">
              Professional accounting made accessible
            </p>
          </div>

          {/* Card Content */}
          <div className="gap-4 grid grid-cols-1 sm:grid-cols-3 mt-10">
            {features.map((item, index) => (
              <Card
                key={index}
                shadow="none"
                radius="none"
                className="rounded-4xl"
              >
                <CardBody className="block text-start p-5 py-7">
                  <div className="">
                    <Button
                      className="bg-brand-background  mb-7"
                      radius="lg"
                      color="primary"
                      variant="light"
                      size="lg"
                      isIconOnly
                    >
                      <item.icon className="w-7 h-7 text-primary" />
                    </Button>
                    <p className="font-heading leading-none text-lg mb-3.5">
                      {item.title}
                    </p>
                    <p className="text-default-500 text-sm leading-5">
                      {item.description}
                    </p>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        </section>

        {/* Why Rekordly  */}
        <section id="why-rekordly" className="p-3 md:p-14 md:py-28">
          <div className="text-center">
            <div className="flex items-center gap-2 mb-1.5 justify-center">
              <CaretCircleDoubleRight
                size={20}
                weight="fill"
                className="text-primary"
              />
              <p className="text-sm md:text-xl font-medium text-primary">
                Why Rekordly
              </p>
            </div>
            <p className="text-foreground font-heading text-4xl md:text-5xl md:w-8/12 mx-auto tracking-tight">
              {`There's a smarter way to manage your accounts`}
            </p>
          </div>

          {/* Cards */}
          <Card
            shadow="none"
            radius="none"
            className="rounded-4xl max-w-3xl mx-auto mt-10"
          >
            <CardBody className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-0 ">
              {comparisonData.map((group, index) => {
                const Icon = group.icon;

                return (
                  <Card
                    key={index}
                    shadow="none"
                    radius="lg"
                    className={`
                rounded-4xl p-1
                ${
                  group.highlight
                    ? 'border-2 border-primary bg-linear-to-b from-primary/5 to-transparent'
                    : ''
                }
              `}
                  >
                    <CardBody className="p-6">
                      <h3 className="font-heading text-lg mb-5">
                        {group.title}
                      </h3>

                      <ul className="space-y-4">
                        {group.items.map((item, i) => (
                          <li
                            key={i}
                            className="flex items-start gap-3 text-sm text-default-600"
                          >
                            <Icon
                              size={20}
                              weight="fill"
                              className={
                                group.accent === 'success'
                                  ? 'text-primary'
                                  : 'text-danger'
                              }
                            />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </CardBody>
                  </Card>
                );
              })}
            </CardBody>
          </Card>
        </section>

        {/* Testimonies */}
        <section id="testimonies" className="py-24  overflow-hidden">
          <div className="md:flex px-3 md:px-14 items-center justify-between text-center md:text-start gap-2 mb-1.5">
            <p className="text-foreground font-heading text-4xl md:text-5xl tracking-tighter md:w-7/12 mb-3 md:mb-0">
              Trusted by businesses and professionals
            </p>
            <p className="text-sm mx-auto md:mx-0 md:text-lg text-white w-10/12 md:w-4/12 font-light">
              Nigerian businesses and professionals trust Rekordly to manage
              accounts, ensure compliance, and make informed decisions.
            </p>
          </div>

          <div className="space-y-4 mt-10 relative">
            {/* Top Row - Scrolling Left */}

            {/* LEFT GRADIENT */}
            <div className="pointer-events-none absolute left-0 top-0 z-10 h-full w-24 bg-linear-to-r from-brand-background to-transparent" />

            {/* RIGHT GRADIENT */}
            <div className="pointer-events-none absolute right-0 top-0 z-10 h-full w-24 bg-linear-to-l from-brand-background to-transparent" />
            <div className="relative">
              <div className="flex gap-3 animate-scroll-left">
                {topRowTestimonials.map((testimonial, index) => (
                  <Card
                    key={`top-${index}`}
                    className="w-64 md:w-100 bg-zinc-900 rounded-4xl border border-zinc-800 shrink-0"
                    shadow="none"
                  >
                    <CardBody className="p-6">
                      <div className="flex items-start gap-3 mb-4">
                        <Quotes size={36} weight="fill" />

                        <p className="text-white text-lg md:text-xl mb-6 ">
                          {testimonial.quote}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Avatar
                          src={testimonial.avatar}
                          size="md"
                          className="shrink-0"
                        />
                        <div>
                          <p className="text-white font-semibold">
                            {testimonial.name}
                          </p>
                          <p className="text-gray-400 text-sm">
                            {testimonial.role}
                          </p>
                        </div>
                      </div>
                    </CardBody>
                  </Card>
                ))}
              </div>
            </div>

            {/* Bottom Row - Scrolling Right */}
            <div className="relative">
              <div className="flex gap-3 animate-scroll-right">
                {bottomRowTestimonials.map((testimonial, index) => (
                  <Card
                    key={`bottom-${index}`}
                    className="w-64 md:w-100 bg-zinc-900 rounded-4xl border border-zinc-800 shrink-0"
                    shadow="none"
                  >
                    <CardBody className="p-6">
                      <div className="flex items-start gap-3 mb-4">
                        <Quotes size={36} weight="fill" />

                        <p className="text-white text-xl mb-6 ">
                          {testimonial.quote}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Avatar
                          src={testimonial.avatar}
                          size="md"
                          className="shrink-0"
                        />
                        <div>
                          <p className="text-white font-semibold">
                            {testimonial.name}
                          </p>
                          <p className="text-gray-400 text-sm">
                            {testimonial.role}
                          </p>
                        </div>
                      </div>
                    </CardBody>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* F. A. Q */}
        <section id="faq" className="py-24 px-3 md:px-14  overflow-hidden">
          <div className="md:flex  items-center justify-between text-center md:text-start gap-2 mb-1.5">
            <p className="text-foreground font-heading text-4xl md:text-5xl tracking-tighter md:w-6/12 mb-3 md:mb-0">
              {`Got questions? We've got answers.`}
            </p>
            <div className="mx-auto md:mx-0 w-10/12 md:w-4/12">
              <p className="text-sm  md:text-lg text-white  font-light">
                {`Everything you need to know about Rekordly's accounting
                features.`}
              </p>
              <Button
                radius="lg"
                color="primary"
                className="border-0"
                endContent={<ArrowUpRight className="w-4 h-4" />}
                variant="ghost"
                size="lg"
              >
                Contact us
              </Button>
            </div>
          </div>

          <div className="space-y-4 mt-10 relative">
            <Accordion
              selectionMode="single"
              variant="splitted"
              className="gap-4 p-0 border-0"
            >
              {faqs.map((faq, index) => (
                <AccordionItem
                  key={index}
                  aria-label={faq.question}
                  startContent={
                    <Button
                      isIconOnly
                      size="md"
                      className="text-primary bg-zinc-800"
                    >
                      0{index + 1}
                    </Button>
                  }
                  title={faq.question}
                  indicator={({ isOpen }) => (
                    <div
                      className={`mr-3 flex items-center justify-center transition-all duration-300 ease-out 
            ${isOpen ? 'rotate-180 scale-110' : 'rotate-0 scale-100'}
          `}
                    >
                      {isOpen ? (
                        <Minus
                          size={20}
                          weight="bold"
                          className="text-primary-500"
                        />
                      ) : (
                        <Plus
                          size={20}
                          weight="bold"
                          className="text-primary-500"
                        />
                      )}
                    </div>
                  )}
                  classNames={{
                    base: `bg-zinc-900 border border-white/10 rounded-3xl px-4 py-2 data-[open=true]:border-primary-500/30`,
                    title: 'text-white text-xl',
                    trigger: 'py-3 gap-3',
                    content: 'text-gray-400 pl-12 pr-8 pb-2',
                  }}
                >
                  {faq.answer}
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>

        <section
          id="cta"
          className="py-24 px-3 md:px-14 max-w-5xl mx-auto overflow-hidden"
        >
          <Card shadow="none" radius="none" className="bg-zinc-900 rounded-4xl">
            <CardBody className="p-10 pt-14">
              <div className="grid grid-cols-1 md:grid-cols-2">
                <div>
                  <h2 className="text-3xl md:text-4xl font-heading text-white mb-2 tracking-tight ">
                    Ready to simplify your accounting?
                  </h2>
                  <p className="text-base font-light text-white/90 mb-4 max-w-xl mx-auto">
                    Join thousands of Nigerian businesses using Rekordly to
                    manage their accounts
                  </p>
                  <Button
                    className="bg-linear-to-r from-primary-400 to-primary-500 text-black  px-6 mb-3"
                    endContent={<ArrowUpRight className="w-4 h-4" />}
                    radius="full"
                    color="primary"
                    variant="shadow"
                  >
                    Get Started for Free
                  </Button>
                </div>
              </div>
            </CardBody>
          </Card>
        </section>
      </section>

      {/* Footer */}
      <footer className=" py-12 bg-background/30">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-linear-to-br from-primary to-secondary rounded-xl flex items-center justify-center shadow-lg">
                  <Receipt className="w-5 h-5 text-white" weight="bold" />
                </div>
                <span className="text-lg font-bold">Rekordly</span>
              </div>
              <p className="text-default-600 text-sm mb-4">
                Professional accounting for Nigerian businesses and
                professionals.
              </p>
              <div className="flex gap-3">
                <a
                  href="#"
                  className="w-8 h-8 rounded-lg bg-default-100 hover:bg-primary hover:text-white flex items-center justify-center transition-colors"
                >
                  <FacebookLogo size={18} weight="bold" />
                </a>
                <a
                  href="#"
                  className="w-8 h-8 rounded-lg bg-default-100 hover:bg-primary hover:text-white flex items-center justify-center transition-colors"
                >
                  <TwitterLogo size={18} weight="bold" />
                </a>
                <a
                  href="#"
                  className="w-8 h-8 rounded-lg bg-default-100 hover:bg-primary hover:text-white flex items-center justify-center transition-colors"
                >
                  <InstagramLogo size={18} weight="bold" />
                </a>
                <a
                  href="#"
                  className="w-8 h-8 rounded-lg bg-default-100 hover:bg-primary hover:text-white flex items-center justify-center transition-colors"
                >
                  <LinkedinLogo size={18} weight="bold" />
                </a>
              </div>
            </div>

            <div>
              <h4 className="font-semibold mb-4 text-sm">Product</h4>
              <ul className="space-y-2 text-default-600 text-sm">
                <li>
                  <a
                    className="hover:text-primary transition-colors"
                    href="#features"
                  >
                    Features
                  </a>
                </li>
                <li>
                  <a
                    className="hover:text-primary transition-colors"
                    href="#pricing"
                  >
                    Pricing
                  </a>
                </li>
                <li>
                  <a className="hover:text-primary transition-colors" href="#">
                    Security
                  </a>
                </li>
                <li>
                  <a className="hover:text-primary transition-colors" href="#">
                    Updates
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-4 text-sm">Company</h4>
              <ul className="space-y-2 text-default-600 text-sm">
                <li>
                  <a className="hover:text-primary transition-colors" href="#">
                    About Us
                  </a>
                </li>
                <li>
                  <a className="hover:text-primary transition-colors" href="#">
                    Blog
                  </a>
                </li>
                <li>
                  <a className="hover:text-primary transition-colors" href="#">
                    Careers
                  </a>
                </li>
                <li>
                  <a className="hover:text-primary transition-colors" href="#">
                    Contact
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-4 text-sm">Legal</h4>
              <ul className="space-y-2 text-default-600 text-sm">
                <li>
                  <a className="hover:text-primary transition-colors" href="#">
                    Privacy Policy
                  </a>
                </li>
                <li>
                  <a className="hover:text-primary transition-colors" href="#">
                    Terms of Service
                  </a>
                </li>
                <li>
                  <a className="hover:text-primary transition-colors" href="#">
                    Cookie Policy
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-divider pt-8">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
              <p className="text-default-600 text-sm text-center md:text-left">
                © 2025 Rekordly. All rights reserved. Made with ❤️ in Nigeria.
              </p>
              <div className="flex items-center gap-4 text-sm text-default-600">
                <a
                  href="#"
                  className="hover:text-primary transition-colors flex items-center gap-1"
                >
                  <EnvelopeSimple size={16} weight="bold" />
                  hello@rekordly.com
                </a>
                <a
                  href="#"
                  className="hover:text-primary transition-colors flex items-center gap-1"
                >
                  <Phone size={16} weight="bold" />
                  +234 812 XXX XXXX
                </a>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
