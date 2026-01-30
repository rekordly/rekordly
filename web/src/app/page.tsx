'use client';

import { useState, useEffect } from 'react';
import { Card, CardBody, CardFooter } from '@heroui/card';
import { Button } from '@heroui/button';
import { Chip } from '@heroui/chip';

import {
  features,
  testimonials,
  list,
  comparisonData,
  faqs,
  businessTypes,
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
  Sparkle,
  Quotes,
  Minus,
  Plus,
} from '@phosphor-icons/react';
import Navbar from '@/components/landingPage/Navbar';
import { Image } from '@heroui/image';
import { Accordion, AccordionItem, Avatar } from '@heroui/react';
import { useScroll, useTransform, motion } from 'framer-motion';
import { WaitlistModal } from '@/components/modals/WaitlistModal';

export default function RekordlyLanding() {
  const [isScrolled, setIsScrolled] = useState(false);
  const topRowTestimonials = [...testimonials, ...testimonials];
  const bottomRowTestimonials = [
    ...testimonials.slice().reverse(),
    ...testimonials.slice().reverse(),
  ];

  const { scrollY } = useScroll();
  const glowOpacity = useTransform(scrollY, [0, 300], [0.4, 0]);
  const glowScale = useTransform(scrollY, [0, 300], [1, 0.8]);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };

    window.addEventListener('scroll', handleScroll);

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Animation variants
  const fadeInUp = {
    hidden: { opacity: 0, y: 30 },
    visible: { opacity: 1, y: 0 },
  };

  const fadeInDown = {
    hidden: { opacity: 0, y: -30 },
    visible: { opacity: 1, y: 0 },
  };

  const fadeInLeft = {
    hidden: { opacity: 0, x: -50 },
    visible: { opacity: 1, x: 0 },
  };

  const fadeInRight = {
    hidden: { opacity: 0, x: 50 },
    visible: { opacity: 1, x: 0 },
  };

  const scaleIn = {
    hidden: { opacity: 0, scale: 0.8 },
    visible: { opacity: 1, scale: 1 },
  };

  const rotateX = useTransform(scrollY, [0, 300], [5, 0]);
  const scale = useTransform(scrollY, [0, 300], [1, 0.98]);
  const y = useTransform(scrollY, [0, 300], [0, 50]);

  const staggerContainer = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  return (
    <main className="min-h-screen dark bg-brand-background">
      <Navbar />
      <section className="relative max-w-5xl mx-auto overflow-hidden px-4 md:px-8">
        {/* Hero Section */}
        <section className="relative pt-20 pb-24">
          <div className="text-center max-w-4xl mx-auto">
            <motion.div
              initial="hidden"
              animate="visible"
              variants={fadeInDown}
              transition={{ duration: 0.6 }}
            >
              <Chip
                className="mb-6 bg-primary-400/10 border border-primary-400/20 text-primary-200 text-xs font-medium"
                startContent={<Sparkle className="w-3.5 h-3.5 ps-1" />}
                variant="shadow"
              >
                All-in-One Business Management
              </Chip>
            </motion.div>

            <div className="mx-auto md:w-9/12 lg:w-8/12">
              <motion.h1
                initial="hidden"
                animate="visible"
                variants={fadeInUp}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="text-4xl md:text-5xl font-heading text-foreground mb-2 leading-none tracking-tight"
              >
                Organize your business.{' '}
                <span className="text-transparent font-medium bg-clip-text bg-linear-to-r from-primary-400 to-primary-600">
                  Know your profit.
                </span>
              </motion.h1>
            </div>

            <motion.div
              initial="hidden"
              animate="visible"
              variants={fadeInUp}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="mx-auto w-10/12 md:w-6/12"
            >
              <p className="text-sm md:text-base text-center text-default-600 mb-6">
                Track sales, manage inventory, and monitor cash flow in one
                simple place.
              </p>
            </motion.div>

            <motion.div
              initial="hidden"
              animate="visible"
              variants={scaleIn}
              transition={{ duration: 0.5, delay: 0.6 }}
            >
              {/* <Button
                className="bg-linear-to-r from-primary-300 to-primary-500 text-black px-6 mb-3"
                endContent={<ArrowUpRight className="w-4 h-4" />}
                radius="full"
                color="primary"
                variant="shadow"
              >
                Get Started for Free
              </Button> */}
              <WaitlistModal className="bg-linear-to-r from-primary-300 rounded-full to-primary-500 text-black px-6 mb-3 p-3" />
            </motion.div>
          </div>

          {/* Green glow effect - BETWEEN button and image */}
          <motion.div
            className="w-5/12 h-28 flex items-center justify-center mb-0 mx-auto -mt-6"
            style={{
              opacity: glowOpacity,
              scale: glowScale,
              background:
                'radial-gradient(ellipse at center, rgba(140, 255, 46, 0.4) 0%, transparent 70%)',
            }}
          />

          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.8 }}
            className="p-2 md:p-5 relative max-w-6xl mx-auto -mt-20 aspect-[1.2] md:aspect-[1.66667] "
            style={
              {
                // perspective: '1200px',
                // aspectRatio: '1.66667',
              }
            }
          >
            {/* Outer container with backdrop blur and mask */}
            <div
              className="relative rounded-[30px] border h-full flex items-center justify-center p-2.5"
              style={{
                backdropFilter: 'blur(2px)',
                backgroundColor: 'rgb(13, 13, 13)',
                borderColor: 'rgba(255, 255, 255, 0.05)',
                borderWidth: '1px',
                mask: 'linear-gradient(0deg, rgba(0, 0, 0, 0) 0%, rgb(0, 0, 0) 98%)',
                WebkitMask:
                  'linear-gradient(0deg, rgba(0, 0, 0, 0) 0%, rgb(0, 0, 0) 98%)',
              }}
            >
              {/* Green glow line at TOP of image */}
              <div
                className="absolute top-0 left-0 right-0 h-px z-20"
                style={{
                  background:
                    'linear-gradient(90deg, rgba(140, 255, 46, 0) 0%, rgb(140, 255, 46) 50%, rgba(140, 255, 46, 0) 100%)',
                }}
              />
              {/* Inner border container */}
              <div
                className="relative rounded-[20px] border w-full h-full overflow-visible flex items-center justify-center"
                style={{
                  borderColor: 'rgba(255, 255, 255, 0.1)',
                  borderWidth: '1px',
                }}
              >
                {/* Image container */}
                <div className="relative rounded-[19px] overflow-hidden w-full h-full">
                  <Image
                    alt="rekordly-dashboard"
                    src="dashboard.jpg"
                    className="w-full h-full object-cover object-top"
                  />
                </div>
              </div>

              {/* Green glow effect behind the container */}
              {/* <div
                className="absolute -bottom-32 left-1/2 -translate-x-1/2 w-80 h-80 rounded-full pointer-events-none"
                style={{
                  backgroundColor: 'rgb(140, 255, 46)',
                  filter: 'blur(50px)',
                  opacity: 0.3,
                  zIndex: -1,
                }}
              /> */}
            </div>

            {/* Your existing gradient overlay */}
            <div className="pointer-events-none absolute right-0 bottom-0 w-full z-10 h-7/12 bg-linear-to-t from-brand-background to-transparent" />
          </motion.div>
        </section>

        {/* How Rekordly works */}
        <section id="how-its-works" className="p-3 lg:p-7 py:24 md:py-28">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-100px' }}
            variants={fadeInLeft}
            transition={{ duration: 0.6 }}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <CaretCircleDoubleRight
                size={20}
                weight="fill"
                className="text-primary"
              />
              <p className="text-sm font-medium text-primary">Watch Video</p>
            </div>
            <p className="text-foreground font-heading  text-3xl md:text-4xl tracking-tighter font-medium">
              How Rekordly Works
            </p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-100px' }}
            variants={staggerContainer}
            className="gap-3 gap-y-4 grid grid-cols-1 sm:grid-cols-3 mt-8"
          >
            {list.map((item, index) => (
              <motion.div
                key={index}
                variants={fadeInUp}
                transition={{ duration: 0.5 }}
              >
                <Card
                  shadow="none"
                  radius="none"
                  className="flex flex-col rounded-4xl pb-7.5 bg-card "
                >
                  <CardBody className="overflow-visible p-2.5">
                    <div className="overflow-hidden rounded-3xl rounded-b-4xl object-center bg-brand-background max-h-64">
                      <Image
                        alt={item.title}
                        className="w-full object-cover object-center max-h-64"
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
                        className="border-1px-2 mb-4"
                        radius="sm"
                        color="primary"
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
              </motion.div>
            ))}
          </motion.div>
        </section>

        {/* Overview */}
        <section id="overview" className="p-3 lg:p-14 py-24">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-100px' }}
            variants={staggerContainer}
            className="md:flex items-center justify-between text-center md:text-start gap-2 mb-1.5"
          >
            <motion.p
              variants={fadeInLeft}
              transition={{ duration: 0.6 }}
              className="text-foreground font-heading text-4xl md:text-5xl tracking-tighter md:w-5/12 mb-3 md:mb-0"
            >
              See your business health clearly
            </motion.p>
            <motion.p
              variants={fadeInRight}
              transition={{ duration: 0.6 }}
              className="text-sm mx-auto md:mx-0 md:text-lg text-white w-10/12 md:w-4/12 font-light leading-6"
            >
              Rekordly brings your sales, inventory, and expenses into one view
              so you always know where you stand.
            </motion.p>
          </motion.div>

          <div className="mt-5">
            {/* Row 1 */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-100px' }}
              variants={staggerContainer}
              className="gap-5 grid grid-cols-1 md:grid-cols-5 mb-5"
            >
              <motion.div
                variants={fadeInLeft}
                transition={{ duration: 0.6 }}
                className="md:col-span-3 w-full"
              >
                <Card
                  isPressable
                  shadow="none"
                  radius="none"
                  className="rounded-4xl h-full bg-card "
                >
                  <CardBody className="overflow-visible p-3">
                    <div className="overflow-hidden rounded-3xl bg-brand-background max-h-72 md:max-h-64">
                      <Image
                        alt="Professional Invoicing"
                        className="w-full object-cover object-center h-72 md:h-64"
                        radius="none"
                        shadow="sm"
                        src="/landing/invoice.png"
                        width="100%"
                      />
                    </div>
                  </CardBody>
                  <CardFooter className="block text-start p-6">
                    <div>
                      <p className="font-heading leading-none text-2xl mb-2">
                        Invoicing Made Easy
                      </p>
                      <p className="text-default-500 text-base md:w-8/12">
                        Send professional invoices in seconds and get paid
                        faster.
                      </p>
                    </div>
                  </CardFooter>
                </Card>
              </motion.div>

              <motion.div
                variants={fadeInRight}
                transition={{ duration: 0.6 }}
                className="md:col-span-2"
              >
                <Card
                  isPressable
                  shadow="none"
                  radius="none"
                  className="rounded-4xl h-full bg-card "
                >
                  <CardBody className="overflow-visible p-3">
                    <div className="overflow-hidden rounded-3xl bg-brand-background max-h-72 md:max-h-64">
                      <Image
                        alt="Sales Tracking"
                        className="w-full object-cover h-72 md:h-64"
                        radius="none"
                        shadow="sm"
                        src="/landing/sales.png"
                        width="100%"
                      />
                    </div>
                  </CardBody>
                  <CardFooter className="block text-start p-6">
                    <div>
                      <p className="font-heading leading-none text-2xl mb-2">
                        Sales & Debt
                      </p>
                      <p className="text-default-500 text-base">
                        Track every sale and instantly see who owes you money.
                      </p>
                    </div>
                  </CardFooter>
                </Card>
              </motion.div>
            </motion.div>

            {/* Row 2 */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-100px' }}
              variants={staggerContainer}
              className="gap-5 grid grid-cols-1 md:grid-cols-12"
            >
              <motion.div
                variants={fadeInUp}
                transition={{ duration: 0.5 }}
                className="md:col-span-4"
              >
                <Card
                  isPressable
                  shadow="none"
                  radius="none"
                  className="rounded-4xl h-full bg-card "
                >
                  <CardBody className="overflow-visible p-3">
                    <div className="overflow-hidden rounded-3xl bg-brand-background max-h-72 md:max-h-52">
                      <Image
                        alt="Production Tracking"
                        className="w-full object-cover object-center h-72 md:h-52"
                        radius="none"
                        shadow="sm"
                        src="/landing/production.png"
                        width="100%"
                      />
                    </div>
                  </CardBody>
                  <CardFooter className="block text-start p-6">
                    <div>
                      <p className="font-heading leading-none text-2xl mb-2">
                        Production & Recipes
                      </p>
                      <p className="text-default-500 text-base">
                        Manage manufacturing batches, track material usage, and
                        calculate unit costs.
                      </p>
                    </div>
                  </CardFooter>
                </Card>
              </motion.div>

              <motion.div
                variants={fadeInUp}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="md:col-span-4"
              >
                <Card
                  shadow="none"
                  radius="none"
                  className="rounded-4xl w-full h-full p-3 bg-card"
                >
                  <CardBody className="overflow-visible p-0 w-full">
                    <div className="overflow-hidden rounded-3xl bg-brand-background max-h-72 md:max-h-52">
                      <Image
                        alt="Inventory Management"
                        className="w-full object-cover h-72 md:h-52"
                        radius="none"
                        shadow="sm"
                        src="/landing/inventory.png"
                        width="100%"
                      />
                    </div>
                  </CardBody>
                  <CardFooter className="block text-start p-6">
                    <div>
                      <p className="font-heading leading-none text-2xl mb-2">
                        Inventory & Stock
                      </p>
                      <p className="text-default-500 text-base">
                        Track stock levels. Set reorder alerts and manage raw
                        materials.
                      </p>
                    </div>
                  </CardFooter>
                </Card>
              </motion.div>

              <motion.div
                variants={fadeInUp}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="md:col-span-4 flex flex-col gap-5"
              >
                <Card
                  shadow="none"
                  radius="none"
                  className="rounded-4xl p-0 flex-1"
                >
                  <div className="w-full h-full bg-linear-to-br from-primary-800/10 to-primary-900/5 flex flex-col items-center justify-center p-6">
                    <div className="text-center">
                      <p className="text-primary-600 text-sm font-semibold uppercase tracking-wider mb-2">
                        Business Records
                      </p>
                      <p className="font-heading leading-none text-2xl mb-3">
                        Organized Records
                      </p>
                      <p className="text-default-600 text-sm">
                        All your business records neatly stored and easy to
                        access anytime.
                      </p>
                    </div>
                  </div>
                </Card>

                <Card
                  shadow="none"
                  radius="none"
                  className="rounded-4xl p-0 flex-1"
                >
                  <div className="w-full h-full bg-linear-to-br from-primary-800/50 to-primary-700/10 flex flex-col items-center justify-center p-6">
                    <div className="text-center">
                      <p className="text-primary-600 text-sm font-semibold uppercase tracking-wider mb-2">
                        Reports & Insights
                      </p>
                      <p className="font-heading leading-none text-2xl mb-3">
                        Reports & Insights
                      </p>
                      <p className="text-default-600 text-sm">
                        Get clear summaries of sales, expenses, and profits in
                        one place.
                      </p>
                    </div>
                  </div>
                </Card>
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* Business Types */}
        <section id="business-types" className="p-3 lg:p-14 py-24">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-100px' }}
            variants={fadeInDown}
            transition={{ duration: 0.6 }}
            className="text-center mb-10"
          >
            <div className="flex items-center gap-2 mb-1.5 justify-center">
              <CaretCircleDoubleRight
                size={20}
                weight="fill"
                className="text-primary"
              />
              <p className="text-sm md:text-xl font-medium text-primary">
                For Everyone
              </p>
            </div>
            <p className="text-foreground font-heading text-4xl md:text-5xl md:w-8/12 mx-auto tracking-tight">
              Built for every business type
            </p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-100px' }}
            variants={staggerContainer}
            className="gap-4 grid grid-cols-1 md:grid-cols-2 mt-10"
          >
            {businessTypes.map((type, index) => {
              const Icon = type.icon;
              return (
                <motion.div
                  key={index}
                  variants={index % 2 === 0 ? fadeInLeft : fadeInRight}
                  transition={{ duration: 0.6 }}
                >
                  <Card
                    shadow="none"
                    radius="none"
                    className="rounded-4xl bg-card border border-zinc-800"
                  >
                    <CardBody className="p-6 flex flex-col items-start h-full">
                      <div className="mb-4 bg-primary-500/20 p-3 rounded-2xl">
                        <Icon className="w-6 h-6 text-primary" />
                      </div>
                      <h3 className="font-heading text-xl mb-2 text-white">
                        {type.title}
                      </h3>
                      <p className="text-default-500 text-sm leading-relaxed">
                        {type.description}
                      </p>
                    </CardBody>
                  </Card>
                </motion.div>
              );
            })}
          </motion.div>
        </section>

        {/* Features */}
        <section id="features" className="p-3 lg:p-7 py:24 md:py-28">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-100px' }}
            variants={scaleIn}
            transition={{ duration: 0.6 }}
            className="text-center"
          >
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
              Everything you need to grow
            </p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-100px' }}
            variants={staggerContainer}
            className="gap-4 grid grid-cols-1 sm:grid-cols-3 mt-10"
          >
            {features.map((item, index) => (
              <motion.div
                key={index}
                variants={fadeInUp}
                transition={{ duration: 0.5 }}
                whileHover={{ y: -5, transition: { duration: 0.2 } }}
              >
                <Card
                  shadow="none"
                  radius="none"
                  className="rounded-4xl bg-card border border-zinc-800"
                >
                  <CardBody className="block text-start p-5 py-7">
                    <div className="">
                      <Button
                        className="bg-brand-background mb-7"
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
              </motion.div>
            ))}
          </motion.div>
        </section>

        {/* Why Rekordly */}
        <section id="why-rekordly" className="p-3 md:p-14 py-24 md:py-28">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-100px' }}
            variants={fadeInUp}
            transition={{ duration: 0.6 }}
            className="text-center"
          >
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
              {`Stop managing your business on spreadsheets`}
            </p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-100px' }}
            variants={scaleIn}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <Card
              shadow="none"
              radius="none"
              className="rounded-4xl bg-card border border-zinc-800 max-w-3xl mx-auto mt-10"
            >
              <CardBody className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-0 ">
                {comparisonData.map((group, index) => {
                  const Icon = group.icon;

                  return (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, x: index === 0 ? -30 : 30 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.6, delay: index * 0.2 }}
                    >
                      <Card
                        shadow="none"
                        radius="lg"
                        className={`
                rounded-4xl p-1 bg-card  
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
                    </motion.div>
                  );
                })}
              </CardBody>
            </Card>
          </motion.div>
        </section>

        {/* Testimonies */}
        <section id="testimonies" className="py-24 overflow-hidden">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-100px' }}
            variants={staggerContainer}
            className="md:flex px-3 md:px-14 items-center justify-between text-center md:text-start gap-2 mb-1.5"
          >
            <motion.p
              variants={fadeInLeft}
              transition={{ duration: 0.6 }}
              className="text-foreground font-heading text-4xl md:text-5xl tracking-tighter md:w-7/12 mb-3 md:mb-0"
            >
              Trusted by businesses and professionals
            </motion.p>
            <motion.p
              variants={fadeInRight}
              transition={{ duration: 0.6 }}
              className="text-sm mx-auto md:mx-0 md:text-lg text-white w-10/12 md:w-4/12 font-light"
            >
              Nigerian businesses and professionals trust Rekordly to manage
              inventory, sales, and track profitability.
            </motion.p>
          </motion.div>

          <div className="space-y-4 mt-10 relative">
            <div className="pointer-events-none absolute left-0 top-0 z-10 h-full w-24 bg-linear-to-r from-brand-background to-transparent" />
            <div className="pointer-events-none absolute right-0 top-0 z-10 h-full w-24 bg-linear-to-l from-brand-background to-transparent" />

            <div className="relative">
              <div className="flex gap-3 animate-scroll-left">
                {topRowTestimonials.map((testimonial, index) => (
                  <Card
                    key={`top-${index}`}
                    className="w-64 md:w-100 bg-card border border-zinc-800 rounded-4xl  shrink-0"
                    shadow="none"
                  >
                    <CardBody className="p-6">
                      <div className="flex items-start gap-3 mb-4">
                        <Quotes size={36} weight="fill" />
                        <p className="text-white text-lg md:text-xl mb-6">
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

            <div className="relative">
              <div className="flex gap-3 animate-scroll-right">
                {bottomRowTestimonials.map((testimonial, index) => (
                  <Card
                    key={`bottom-${index}`}
                    className="w-64 md:w-100 bg-card border border-zinc-800 rounded-4xl  shrink-0"
                    shadow="none"
                  >
                    <CardBody className="p-6">
                      <div className="flex items-start gap-3 mb-4">
                        <Quotes size={36} weight="fill" />
                        <p className="text-white text-xl mb-6">
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

        {/* FAQ */}
        <section id="faq" className="py-24 px-3 md:px-14 overflow-hidden">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-100px' }}
            variants={staggerContainer}
            className="md:flex items-center justify-between text-center md:text-start gap-2 mb-1.5"
          >
            <motion.p
              variants={fadeInLeft}
              transition={{ duration: 0.6 }}
              className="text-foreground font-heading text-4xl md:text-5xl tracking-tighter md:w-6/12 mb-3 md:mb-0"
            >
              {`Got questions? We've got answers.`}
            </motion.p>
            <motion.div
              variants={fadeInRight}
              transition={{ duration: 0.6 }}
              className="mx-auto md:mx-0 w-10/12 md:w-4/12"
            >
              <p className="text-sm md:text-lg text-white font-light">
                {`Everything you need to know about managing your business with
                Rekordly.`}
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
            </motion.div>
          </motion.div>

          <div className="space-y-4 mt-10 relative">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-100px' }}
              variants={fadeInUp}
              transition={{ duration: 0.6 }}
            >
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
                        className="text-primary bg-card border border-zinc-800"
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
                      base: `bg-card border border-zinc-800 rounded-3xl px-4 py-2 data-[open=true]:border-primary-500/30`,
                      title: 'text-white text-xl',
                      trigger: 'py-3 gap-3',
                      content: 'text-gray-400 pl-12 pr-8 pb-2',
                    }}
                  >
                    {faq.answer}
                  </AccordionItem>
                ))}
              </Accordion>
            </motion.div>
          </div>
        </section>

        {/* CTA */}
        <section
          id="cta"
          className="py-24 px-3 md:px-14 max-w-5xl mx-auto overflow-hidden"
        >
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-100px' }}
            variants={scaleIn}
            transition={{ duration: 0.6 }}
          >
            <Card
              shadow="none"
              radius="none"
              className="bg-card border border-zinc-800 rounded-4xl"
            >
              <CardBody className="p-10 pt-14">
                <div className="grid grid-cols-1 md:grid-cols-2">
                  <div>
                    <h2 className="text-3xl md:text-4xl font-heading text-white mb-2 tracking-tight">
                      Ready to simplify your business?
                    </h2>
                    <p className="text-base font-light text-white/90 mb-4 max-w-xl mx-auto">
                      Join thousands of Nigerian businesses using Rekordly to
                      track growth and manage cash flow
                    </p>
                    <WaitlistModal className="bg-linear-to-r from-primary-300 rounded-full to-primary-500 text-black px-6 mb-3 p-3" />
                    {/* <Button
                      className="bg-linear-to-r from-primary-400 to-primary-500 text-black px-6 mb-3"
                      endContent={<ArrowUpRight className="w-4 h-4" />}
                      radius="full"
                      color="primary"
                      variant="shadow"
                    >
                      Get Started for Free
                    </Button> */}
                  </div>
                </div>
              </CardBody>
            </Card>
          </motion.div>
        </section>
      </section>

      {/* Footer */}
      <footer className="py-12 bg-background">
        <div className="max-w-6xl mx-auto px-6">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-100px' }}
            variants={staggerContainer}
            className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8"
          >
            <motion.div variants={fadeInUp} transition={{ duration: 0.5 }}>
              <div className="flex items-center gap-2 mb-4">
                <div>
                  <Image
                    src="logo.png"
                    height={24}
                    width={24}
                    alt="Rekordly Logo"
                    radius="none"
                  />
                </div>
                <span className="text-lg font-bold">Rekordly</span>
              </div>
              <p className="text-default-600 text-sm mb-4">
                All-in-one business management for Nigerian businesses.
              </p>
              <div className="flex gap-3">
                <a
                  href="#"
                  className="w-8 h-8 rounded-lg bg-default-100 hover:bg-primary hover:text-white flex items-center justify-center transition-colors"
                >
                  <FacebookLogo size={18} weight="bold" color="white" />
                </a>
                <a
                  href="#"
                  className="w-8 h-8 rounded-lg bg-default-100 hover:bg-primary hover:text-white flex items-center justify-center transition-colors"
                >
                  <TwitterLogo size={18} weight="bold" color="white" />
                </a>
                <a
                  href="#"
                  className="w-8 h-8 rounded-lg bg-default-100 hover:bg-primary hover:text-white flex items-center justify-center transition-colors"
                >
                  <InstagramLogo size={18} weight="bold" color="white" />
                </a>
                <a
                  href="#"
                  className="w-8 h-8 rounded-lg bg-default-100 hover:bg-primary hover:text-white flex items-center justify-center transition-colors"
                >
                  <LinkedinLogo size={18} weight="bold" color="white" />
                </a>
              </div>
            </motion.div>

            <motion.div
              variants={fadeInUp}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
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
                    href="#business-types"
                  >
                    {`Who it's for`}
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
            </motion.div>

            <motion.div
              variants={fadeInUp}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
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
            </motion.div>

            <motion.div
              variants={fadeInUp}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
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
            </motion.div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="border-t border-divider pt-8"
          >
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
              <div className="flex items-center gap-4 text-sm text-default-600">
                <a
                  href="#"
                  className="hover:text-primary transition-colors flex items-center gap-1"
                >
                  <EnvelopeSimple size={16} weight="bold" />
                  rekordlly@gmail.com
                </a>
                <a
                  href="#"
                  className="hover:text-primary transition-colors flex items-center gap-1"
                >
                  <Phone size={16} weight="bold" />
                  +234 805 163 4960
                </a>
              </div>
              <p className="text-default-600 text-sm text-center md:text-left">
                © 2025 Rekordly. All rights reserved. Made with ❤️ in Nigeria.
              </p>
            </div>
          </motion.div>
        </div>
      </footer>
    </main>
  );
}
