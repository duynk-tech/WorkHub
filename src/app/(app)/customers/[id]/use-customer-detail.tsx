'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useState } from 'react';
import { customerInsights } from '@/lib/customer-insights';
import { resolveCustomerView, customerTabForView, type CustomerView } from '@/lib/customer-tabs';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useToast } from '@/components/ui/toast';
import { type FulfillmentMode } from '@/components/domain/order-fulfillment-modal';
import { deleteCustomerPaymentAction, deleteCustomerQuotationAction, convertQuotationToOrderAction } from '@/server/modules/customer/actions';

export interface CustomerDetailProps {
  customer: any;
  canManage: boolean;
  canExport?: boolean;
  employees?: { id: number; fullName: string }[];
  companyInfo?: any;
  spareParts?: any[];
  stockMachines?: any[];
  warehouses?: any[];
  pricingConfig?: any;
}

/**
 * Toàn bộ state, dữ liệu suy ra và handler của màn hồ sơ khách hàng.
 * Màn chính và từng tab (./tabs/*) đọc chung từ đây nên không phải truyền hàng chục props.
 */
export function useCustomerDetail(props: CustomerDetailProps) {
  const { customer, canManage, canExport = false, employees = [], companyInfo, spareParts = [], stockMachines = [], warehouses = [], pricingConfig } = props;
  const router = useRouter();
  const toast = useToast();

  const searchParams = useSearchParams();
  const pathname = usePathname();
  const activeTab = resolveCustomerView(searchParams.get('tab'), searchParams.get('view'));
  const activeGroup = customerTabForView(activeTab);
  const setActiveTab = (view: CustomerView, orderId?: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', customerTabForView(view).key);
    params.set('view', view);
    if (orderId) params.set('order', String(orderId)); else params.delete('order');
    router.push(`${pathname}?${params}`, { scroll: false });
  };
  useEffect(() => {
    const id = searchParams.get('order');
    if (activeTab === 'orders' && id) {
      setExpandedOrderItems(prev => ({ ...prev, [id]: true }));
      document.getElementById(`customer-order-${id}`)?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeTab, searchParams]);
  const insights = customerInsights(customer);
  const purchasedParts = insights.parts;
  const [partsView, setPartsView] = useState<'transactions' | 'items'>('transactions');
  const [printPayment, setPrintPayment] = useState<any>(null);
  const [createQuotationOpen, setCreateQuotationOpen] = useState(false);
  const [editingQuotation, setEditingQuotation] = useState<any>(null);
  const [printingQuotation, setPrintingQuotation] = useState<any>(null);
  const [printingOrder, setPrintingOrder] = useState<any>(null);
  const [fulfillment, setFulfillment] = useState<{ order: any; mode: FulfillmentMode } | null>(null);
  const [poPromptOrder, setPoPromptOrder] = useState<any | null>(null);
  const [paymentOrderId, setPaymentOrderId] = useState<number | 'GENERAL' | null>(null);
  const [returnOrder, setReturnOrder] = useState<any>(null);
  const [editCustomerModalOpen, setEditCustomerModalOpen] = useState(false);
  const [createLocationModalOpen, setCreateLocationModalOpen] = useState(false);
  const [handoverEquipment, setHandoverEquipment] = useState<any | null>(null);
  const [expandedOrderItems, setExpandedOrderItems] = useState<Record<string, boolean>>({});
  const [expandedQuotationItems, setExpandedQuotationItems] = useState<Record<string, boolean>>({});

  const toggleOrderItems = (orderId: string | number) => {
    setExpandedOrderItems(prev => ({ ...prev, [String(orderId)]: !prev[String(orderId)] }));
  };

  const toggleQuotationItems = (quoteId: string | number) => {
    setExpandedQuotationItems(prev => ({ ...prev, [String(quoteId)]: !prev[String(quoteId)] }));
  };


  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    message: React.ReactNode;
    confirmText?: string;
    danger?: boolean;
    onConfirm: () => void | Promise<void>;
  }>({ open: false, title: '', message: '', onConfirm: () => {} });

  const handleDeleteQuotation = (quotationId: number) => {
    setConfirmDialog({
      open: true,
      title: 'Xóa báo giá',
      message: 'Bạn có chắc chắn muốn xóa báo giá này? Thao tác này không thể hoàn tác.',
      confirmText: 'Xóa vĩnh viễn',
      danger: true,
      onConfirm: async () => {
        const res = await deleteCustomerQuotationAction(quotationId, customer.id);
        if (res.ok) {
          toast.success(res.message);
          router.refresh();
        } else {
          toast.error(res.message);
        }
      },
    });
  };

  const handleConvertQuotation = (q: any) => {
    setConfirmDialog({
      open: true,
      title: 'Chốt đơn hàng từ báo giá',
      message: `Chốt báo giá ${q.quoteCode} thành đơn hàng chính thức cho khách hàng?`,
      confirmText: 'Chốt đơn ngay',
      danger: false,
      onConfirm: async () => {
        const res = await convertQuotationToOrderAction(q.id, customer.id);
        if (res.ok) {
          toast.success(res.message);
          setActiveTab('orders');
          if (res.order?.status === 'AWAITING_STOCK') setPoPromptOrder(res.order);
          router.refresh();
        } else {
          toast.error(res.message);
        }
      },
    });
  };

  /** Công nợ: phải thu, đã thu, còn nợ, quá hạn. */
  const debt = insights;

  const handleDeletePayment = (paymentId: number) => {
    setConfirmDialog({
      open: true,
      title: 'Xóa phiếu thu',
      message: 'Bạn có chắc chắn muốn xóa phiếu thu này? Công nợ của đơn hàng sẽ được hoàn lại tương ứng.',
      confirmText: 'Xóa phiếu thu',
      danger: true,
      onConfirm: async () => {
        const res = await deleteCustomerPaymentAction(paymentId, customer.id);
        if (res.ok) {
          toast.success(res.message);
          router.refresh();
        } else {
          toast.error(res.message);
        }
      },
    });
  };

  const totalSpent = (customer.orders || []).reduce(
    (sum: number, o: any) => (o.status !== 'CANCELLED' ? sum + Number(o.totalAmount || 0) : sum),
    0,
  );

  return {
    activeGroup, activeTab, canExport, canManage, companyInfo, confirmDialog, createLocationModalOpen, createQuotationOpen, customer, debt, editCustomerModalOpen, editingQuotation, employees, expandedOrderItems, expandedQuotationItems, fulfillment, handleConvertQuotation, handleDeletePayment, handleDeleteQuotation, handoverEquipment, insights, partsView, pathname, paymentOrderId, poPromptOrder, pricingConfig, printPayment, printingOrder, printingQuotation, purchasedParts, returnOrder, router, searchParams, setActiveTab, setConfirmDialog, setCreateLocationModalOpen, setCreateQuotationOpen, setEditCustomerModalOpen, setEditingQuotation, setExpandedOrderItems, setExpandedQuotationItems, setFulfillment, setHandoverEquipment, setPartsView, setPaymentOrderId, setPoPromptOrder, setPrintPayment, setPrintingOrder, setPrintingQuotation, setReturnOrder, spareParts, stockMachines, toast, toggleOrderItems, toggleQuotationItems, totalSpent, warehouses,
  };
}

export type CustomerDetailState = ReturnType<typeof useCustomerDetail>;
