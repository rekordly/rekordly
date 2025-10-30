"use client";

import { useState, useEffect } from "react";
import { CreateInvoiceFlow } from "@/components/dashboard/invoice/CreateInvoiceFlow";
import { InvoiceLoadingSkeleton } from "@/components/dashboard/invoice/InvoiceLoadingSkeleton";
import { CustomerType } from "@/types/invoice";
import axios from "axios";

export default function NewInvoicePage() {
  const [customers, setCustomers] = useState<CustomerType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        setLoading(true);
        const response = await axios.get('/api/user/customers');
        setCustomers(response.data.customers || []);
      } catch (error) {
        console.error('Error fetching customers:', error);
        setCustomers([]);
      } finally {
        setLoading(false);
      }
    };

    fetchCustomers();
  }, []);

  if (loading) {
    return (
      <div className="container mx-auto">
        <InvoiceLoadingSkeleton />
      </div>
    );
  }

  return (
    <div className="container mx-auto">
      <CreateInvoiceFlow customers={customers} />
    </div>
  );
}