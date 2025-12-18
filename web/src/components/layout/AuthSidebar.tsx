import React from 'react';
import { Card, CardBody } from '@heroui/card';
import { Chip } from '@heroui/chip';

interface TeamMember {
  name: string;
  role: string;
  country: string;
  avatar: string;
}

const teamMembers: TeamMember[] = [
  { name: 'Jacob', role: 'Contractor', country: '🇦🇷', avatar: 'JC' },
  { name: 'Olivia', role: 'Employee', country: '🇧🇪', avatar: 'OL' },
  { name: 'Patricia', role: 'Employee', country: '🇵🇹', avatar: 'PT' },
  { name: 'Martha', role: 'Contractor', country: '🇺🇸', avatar: 'MR' },
];

export const AuthSidebar = () => {
  return (
    <div className="w-full h-screen bg-gradient-to-br from-brand-900 via-brand-800 to-brand-900 p-8 flex flex-col relative overflow-hidden">
      {/* Decorative Pattern */}
      <div className="absolute bottom-0 right-0 w-64 h-64 opacity-20">
        <div
          className="absolute bottom-0 right-0 w-full h-full"
          style={{
            backgroundImage: `radial-gradient(circle, #60a5fa 20%, transparent 20%)`,
            backgroundSize: '30px 30px',
            backgroundPosition: '0 0, 15px 15px',
          }}
        />
      </div>

      {/* Logo */}
      <div className="mb-12 z-10">
        <div className="flex items-center gap-2 text-white">
          <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
            <span className="text-brand-900 font-bold text-xl">R</span>
          </div>
          <span className="text-2xl font-semibold">remote</span>
        </div>
      </div>

      {/* Icon */}
      <div className="mb-6 z-10">
        <div className="w-12 h-12 bg-brand-700 rounded-lg flex items-center justify-center">
          <svg
            className="w-6 h-6 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
            />
          </svg>
        </div>
      </div>

      {/* Header */}
      <div className="mb-8 z-10">
        <h1 className="text-white text-3xl font-bold mb-3">
          Sign up and come on in.
        </h1>
        <p className="text-brand-200 text-sm leading-relaxed">
          Sign up is simple, free and fast. One place to manage
          <br />
          everything, and everyone.
        </p>
      </div>

      {/* Manage Teams Card */}
      <div className="mb-6 z-10">
        <div className="flex items-start gap-3 mb-4">
          <svg
            className="w-5 h-5 text-white mt-1"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
            />
          </svg>
          <div>
            <h3 className="text-white font-semibold">Manage teams</h3>
            <p className="text-brand-200 text-sm">Contractors to employees</p>
          </div>
        </div>

        <Card className="bg-white/95 backdrop-blur-sm">
          <CardBody className="p-4">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-3 px-2">
              <span>NAME</span>
              <span>CONTRACT</span>
              <span>COUNTRY</span>
            </div>
            {teamMembers.map((member, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between py-2 px-2 hover:bg-gray-50 rounded-lg transition-colors"
              >
                <div className="flex items-center gap-3 flex-1">
                  <div className="w-8 h-8 bg-gradient-to-br from-brand-400 to-brand-600 rounded-full flex items-center justify-center text-white text-xs font-semibold">
                    {member.avatar}
                  </div>
                  <span className="text-sm font-medium text-gray-900">
                    {member.name}
                  </span>
                </div>
                <span className="text-sm text-gray-600 flex-1 text-center">
                  {member.role}
                </span>
                <span className="text-lg">{member.country}</span>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      {/* Cost Card */}
      <div className="mb-6 z-10">
        <Card className="bg-white/95 backdrop-blur-sm">
          <CardBody className="p-5">
            <div className="mb-4">
              <div className="text-sm text-gray-700 mb-1">
                Cost to hire a{' '}
                <span className="text-red-600 font-semibold">Engineer</span> in
              </div>
              <div className="flex items-center gap-2">
                <span className="text-2xl">🇦🇺</span>
                <span className="text-brand-600 font-semibold">Australia</span>
              </div>
              <Chip className="mt-2" size="sm" variant="flat">
                ANNUALLY
              </Chip>
            </div>
            <div className="space-y-3 border-t pt-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Base salary</span>
                <span className="font-semibold text-gray-900">$100,000</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">
                  Mandatory employer costs
                </span>
                <span className="font-semibold text-gray-900">$17,105.04</span>
              </div>
              <div className="flex justify-between items-center pt-3 border-t">
                <span className="font-semibold text-gray-900">Total</span>
                <span className="font-bold text-gray-900">$117,105.04</span>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Calculate Section */}
      <div className="z-10">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-brand-700 rounded-lg flex items-center justify-center shrink-0">
            <svg
              className="w-5 h-5 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
              />
            </svg>
          </div>
          <div>
            <h3 className="text-white font-semibold">Calculate</h3>
            <p className="text-brand-200 text-sm">Total cost of employment</p>
          </div>
        </div>
      </div>
    </div>
  );
};
