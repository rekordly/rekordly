'use client';

import React from 'react';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Chip,
} from '@heroui/react';
import {
  Mail,
  Phone,
  Calendar,
  TrendingUp,
  TrendingDown,
  ShoppingCart,
  Package,
} from 'lucide-react';

import { CustomerType } from '@/types/customer';
import { formatCurrency, formatDate } from '@/lib/fn';

interface ViewCustomerModalProps {
  customer: CustomerType | null;
  isOpen: boolean;
  onClose: () => void;
}

export function ViewCustomerModal({
  customer,
  isOpen,
  onClose,
}: ViewCustomerModalProps) {
  if (!customer) return null;

  const isBuyer = customer.customerRole === 'BUYER';

  return (
    <Modal
      backdrop="blur"
      isOpen={isOpen}
      placement="center"
      size="2xl"
      onClose={onClose}
    >
      <ModalContent className="bg-brand-background">
        {() => (
          <>
            <ModalHeader className="flex flex-col gap-2 font-heading tracking-tight border-b border-default-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold">{customer.name}</h3>
                  <p className="text-xs text-default-500 font-normal mt-1">
                    Customer ID: {customer.id}
                  </p>
                </div>
                <Chip
                  color={isBuyer ? 'primary' : 'secondary'}
                  variant="flat"
                  size="sm"
                >
                  {isBuyer ? 'Customer' : 'Vendor'}
                </Chip>
              </div>
            </ModalHeader>

            <ModalBody className="gap-4 py-6">
              {/* Contact Information */}
              <div>
                <h4 className="text-sm font-semibold mb-3 text-default-700">
                  Contact Information
                </h4>
                <div className="space-y-2">
                  {customer.email ? (
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="w-4 h-4 text-default-400" />
                      <span className="text-default-600">{customer.email}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-default-400">
                      <Mail className="w-4 h-4" />
                      <span>No email provided</span>
                    </div>
                  )}

                  {customer.phone ? (
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="w-4 h-4 text-default-400" />
                      <span className="text-default-600">{customer.phone}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-default-400">
                      <Phone className="w-4 h-4" />
                      <span>No phone provided</span>
                    </div>
                  )}

                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="w-4 h-4 text-default-400" />
                    <span className="text-default-600">
                      Added on {formatDate(customer.createdAt)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Transaction Summary */}
              <div>
                <h4 className="text-sm font-semibold mb-3 text-default-700">
                  Transaction Summary
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  {isBuyer ? (
                    <>
                      <div className="bg-primary-50 dark:bg-primary-900/20 p-3 rounded-lg">
                        <div className="flex items-center gap-2 mb-1">
                          <ShoppingCart className="w-4 h-4 text-primary" />
                          <span className="text-xs text-default-600">
                            Total Sales
                          </span>
                        </div>
                        <p className="text-lg font-bold text-primary">
                          {customer._count?.sales || 0}
                        </p>
                      </div>

                      <div className="bg-success-50 dark:bg-success-900/20 p-3 rounded-lg">
                        <div className="flex items-center gap-2 mb-1">
                          <TrendingUp className="w-4 h-4 text-success" />
                          <span className="text-xs text-default-600">
                            Total Spent
                          </span>
                        </div>
                        <p className="text-lg font-bold text-success">
                          {formatCurrency(customer.totalSpent || 0)}
                        </p>
                      </div>

                      {(customer.totalOwed || 0) > 0 && (
                        <div className="col-span-2 bg-danger-50 dark:bg-danger-900/20 p-3 rounded-lg">
                          <div className="flex items-center gap-2 mb-1">
                            <TrendingDown className="w-4 h-4 text-danger" />
                            <span className="text-xs text-default-600">
                              Outstanding Balance
                            </span>
                          </div>
                          <p className="text-lg font-bold text-danger">
                            {formatCurrency(customer.totalOwed || 0)}
                          </p>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="bg-secondary-50 dark:bg-secondary-900/20 p-3 rounded-lg">
                        <div className="flex items-center gap-2 mb-1">
                          <Package className="w-4 h-4 text-secondary" />
                          <span className="text-xs text-default-600">
                            Total Purchases
                          </span>
                        </div>
                        <p className="text-lg font-bold text-secondary">
                          {customer._count?.purchases || 0}
                        </p>
                      </div>

                      <div className="bg-success-50 dark:bg-success-900/20 p-3 rounded-lg">
                        <div className="flex items-center gap-2 mb-1">
                          <TrendingUp className="w-4 h-4 text-success" />
                          <span className="text-xs text-default-600">
                            Total Purchased
                          </span>
                        </div>
                        <p className="text-lg font-bold text-success">
                          {formatCurrency(customer.totalRevenue || 0)}
                        </p>
                      </div>

                      {(customer.totalDebt || 0) > 0 && (
                        <div className="col-span-2 bg-warning-50 dark:bg-warning-900/20 p-3 rounded-lg">
                          <div className="flex items-center gap-2 mb-1">
                            <TrendingDown className="w-4 h-4 text-warning" />
                            <span className="text-xs text-default-600">
                              Amount We Owe
                            </span>
                          </div>
                          <p className="text-lg font-bold text-warning">
                            {formatCurrency(customer.totalDebt || 0)}
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Status Badge */}
              <div className="bg-default-100 p-3 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-default-600">
                    Account Status
                  </span>
                  {isBuyer ? (
                    (customer.totalOwed || 0) > 0 ? (
                      <Chip color="danger" size="sm" variant="flat">
                        Has Outstanding Balance
                      </Chip>
                    ) : (
                      <Chip color="success" size="sm" variant="flat">
                        Fully Paid
                      </Chip>
                    )
                  ) : (customer.totalDebt || 0) > 0 ? (
                    <Chip color="warning" size="sm" variant="flat">
                      Pending Payment
                    </Chip>
                  ) : (
                    <Chip color="success" size="sm" variant="flat">
                      Fully Paid
                    </Chip>
                  )}
                </div>
              </div>
            </ModalBody>

            <ModalFooter>
              <Button variant="light" onPress={onClose}>
                Close
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
