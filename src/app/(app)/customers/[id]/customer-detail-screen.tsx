'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from 'next/link';
import { CUSTOMER_TABS } from '@/lib/customer-tabs';
import { ArrowLeft, Building2, Phone, Mail, MapPin, Edit2, Package, ShoppingCart, LayoutDashboard, CreditCard, UserCheck } from 'lucide-react';
import { Card, Button, ConfirmDialog, ScrollTabs } from '@/components/ui';
import { CustomerModal, CustomerLocationModal } from '@/components/domain/customer-modals';
import { CustomerQuotationModal, CustomerQuotationPrintModal } from '@/components/domain/customer-quotation-modal';
import { OrderFulfillmentModal } from '@/components/domain/order-fulfillment-modal';
import { CustomerOrderPrintModal } from '@/components/domain/customer-order-print-modal';
import { CustomerPaymentModal } from '@/components/domain/customer-payment-modal';
import { PaymentVoucherModal } from '@/components/domain/payment-voucher-modal';
import { CustomerReturnModal } from '@/components/domain/customer-return-modal';
import { EquipmentHandoverModal } from '@/components/domain/equipment-modals';
import { useCustomerDetail, type CustomerDetailProps } from './use-customer-detail';
import { OverviewTab } from './tabs/overview-tab';
import { PartsTab } from './tabs/parts-tab';
import { MachinesTab } from './tabs/machines-tab';
import { QuotationsTab } from './tabs/quotations-tab';
import { OrdersTab } from './tabs/orders-tab';
import { PaymentsTab } from './tabs/payments-tab';
import { LocationsTab } from './tabs/locations-tab';
import { TicketsTab } from './tabs/tickets-tab';

/**
 * Hồ sơ khách hàng. State và handler nằm trong useCustomerDetail; nội dung mỗi
 * tab là một component riêng trong ./tabs để file không phình to.
 */
export function CustomerDetailScreen(props: CustomerDetailProps) {
  const s = useCustomerDetail(props);
  const { activeGroup, activeTab, canManage, companyInfo, confirmDialog, createLocationModalOpen, createQuotationOpen, customer, debt, editCustomerModalOpen, editingQuotation, fulfillment, handoverEquipment, paymentOrderId, poPromptOrder, pricingConfig, printPayment, printingOrder, printingQuotation, returnOrder, router, setActiveTab, setConfirmDialog, setCreateLocationModalOpen, setCreateQuotationOpen, setEditCustomerModalOpen, setEditingQuotation, setFulfillment, setHandoverEquipment, setPaymentOrderId, setPoPromptOrder, setPrintPayment, setPrintingOrder, setPrintingQuotation, setReturnOrder, spareParts, stockMachines, warehouses } = s;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 50 }}>
      {/* 1. Navigation Back & Quick Breadcrumb */}
      <div>
        <Link
          href="/customers"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 13,
            color: 'var(--text-muted)',
            textDecoration: 'none',
            fontWeight: 500,
          }}
          className="hover:text-blue-600"
        >
          <ArrowLeft size={16} /> Quay lại danh sách Khách hàng
        </Link>
      </div>

      {/* 2. Customer Profile Header Card */}
      <Card style={{ padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 'var(--radius-lg)',
                background: '#eff6ff',
                color: '#2563eb',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
              }}
            >
              <Building2 size={28} />
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: 'var(--text-strong)' }}>
                  {customer.name}
                </h1>
                <span
                  style={{
                    fontFamily: 'monospace',
                    fontWeight: 700,
                    fontSize: 12,
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-xs)',
                    background: '#eff6ff',
                    color: '#2563eb',
                    border: '1px solid #bfdbfe',
                  }}
                >
                  {customer.code}
                </span>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 8, fontSize: 13, color: 'var(--text-muted)' }}>
                {customer.contactName && (
                  <div>
                    Người đại diện: <strong style={{ color: 'var(--text-strong)' }}>{customer.contactName}</strong>
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Phone size={13} /> {customer.phone}
                </div>
                {customer.email && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Mail size={13} /> {customer.email}
                  </div>
                )}
                {customer.address && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <MapPin size={13} /> {customer.address}
                  </div>
                )}
              </div>

            </div>
          </div>

          {canManage && (
            <div>
              <Button size="sm" variant="secondary" onClick={() => setEditCustomerModalOpen(true)}>
                <Edit2 size={13} style={{ marginRight: 6 }} /> Sửa thông tin
              </Button>
            </div>
          )}
        </div>

      </Card>

      {/* ── TABS (Style chuẩn Spare Parts) ── */}
      <ScrollTabs>
        {CUSTOMER_TABS.map((tab) => {
          const isActive = activeGroup.key === tab.key;
          const TabIcon =
            tab.key === 'overview'
              ? LayoutDashboard
              : tab.key === 'transactions'
              ? ShoppingCart
              : tab.key === 'products'
              ? Package
              : tab.key === 'debt'
              ? CreditCard
              : UserCheck;

          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.views[0].key)}
              className="tab"
              data-active={isActive}
            >
              <TabIcon /> {tab.label}
            </button>
          );
        })}
      </ScrollTabs>

      {activeGroup.views.length > 1 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: -6 }}>
          {activeGroup.views.map((view) => {
            const isSubActive = activeTab === view.key;
            return (
              <button
                key={view.key}
                type="button"
                onClick={() => setActiveTab(view.key)}
                style={{
                  padding: '5px 12px',
                  borderRadius: 'var(--radius-full)',
                  fontSize: 12.5,
                  fontWeight: isSubActive ? 600 : 500,
                  background: isSubActive ? 'var(--brand-soft)' : 'var(--surface-sunken)',
                  color: isSubActive ? 'var(--brand)' : 'var(--text-muted)',
                  border: isSubActive ? '1px solid var(--brand-soft-hover)' : '1px solid var(--border-base)',
                  cursor: 'pointer',
                  transition: 'background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease, opacity 0.15s ease',
                }}
              >
                {view.label}
              </button>
            );
          })}
        </div>
      )}

      <OverviewTab s={s} />
      <PartsTab s={s} />
      <MachinesTab s={s} />
      <QuotationsTab s={s} />
      <OrdersTab s={s} />
      <PaymentsTab s={s} />
      <LocationsTab s={s} />
      <TicketsTab s={s} />

      {/* Modals */}
      {editCustomerModalOpen && (
        <CustomerModal
          open={editCustomerModalOpen}
          customer={customer}
          onClose={() => setEditCustomerModalOpen(false)}
          onSuccess={() => router.refresh()}
        />
      )}

      {fulfillment && (
        <OrderFulfillmentModal
          open={Boolean(fulfillment)}
          order={fulfillment.order}
          mode={fulfillment.mode}
          customerId={customer.id}
          warehouses={warehouses}
          onClose={() => setFulfillment(null)}
          onSuccess={() => router.refresh()}
        />
      )}

      <ConfirmDialog
        open={Boolean(poPromptOrder)}
        title="Đơn hàng đang thiếu tồn kho"
        message={`Đơn ${poPromptOrder?.orderCode} đã được tạo và đang chờ hàng. Bạn muốn tạo PO cho phần còn thiếu ngay bây giờ?`}
        confirmText="Tạo PO ngay"
        cancelText="Để sau"
        onClose={() => setPoPromptOrder(null)}
        onConfirm={() => {
          setFulfillment({ order: poPromptOrder, mode: 'SUPPLIER' });
          setPoPromptOrder(null);
        }}
      />

      {returnOrder && (
        <CustomerReturnModal
          open={Boolean(returnOrder)}
          order={returnOrder}
          customerId={customer.id}
          warehouses={warehouses}
          onClose={() => setReturnOrder(null)}
          onSuccess={() => router.refresh()}
        />
      )}

      {printPayment && (
        <PaymentVoucherModal
          open={Boolean(printPayment)}
          onClose={() => setPrintPayment(null)}
          direction="IN"
          payment={printPayment}
          partnerName={customer.name}
          partnerAddress={customer.address}
          company={companyInfo}
        />
      )}

      {paymentOrderId !== null && (
        <CustomerPaymentModal
          open={paymentOrderId !== null}
          customerId={customer.id}
          customerName={customer.name}
          orders={customer.orders || []}
          defaultOrderId={paymentOrderId === 'GENERAL' ? undefined : paymentOrderId}
          onClose={() => setPaymentOrderId(null)}
          onSuccess={() => router.refresh()}
        />
      )}

      {createQuotationOpen && (
        <CustomerQuotationModal
          open={createQuotationOpen}
          customerId={customer.id}
          customerName={customer.name}
          locations={customer.locations}
          machines={customer.machines || []}
          stockMachines={stockMachines}
          spareParts={spareParts}
          pricingConfig={pricingConfig}
          companyInfo={companyInfo}
          onClose={() => setCreateQuotationOpen(false)}
          onSuccess={() => {
            setActiveTab('quotations');
            router.refresh();
          }}
        />
      )}

      {editingQuotation && (
        <CustomerQuotationModal
          open={Boolean(editingQuotation)}
          customerId={customer.id}
          customerName={customer.name}
          locations={customer.locations}
          machines={customer.machines || []}
          stockMachines={stockMachines}
          spareParts={spareParts}
          pricingConfig={pricingConfig}
          companyInfo={companyInfo}
          quotation={editingQuotation}
          onClose={() => setEditingQuotation(null)}
          onSuccess={() => router.refresh()}
        />
      )}

      {printingQuotation && (
        <CustomerQuotationPrintModal
          open={Boolean(printingQuotation)}
          quotation={printingQuotation}
          customer={customer}
          companyInfo={companyInfo}
          machines={[...(customer.machines || []), ...(stockMachines || [])]}
          onClose={() => setPrintingQuotation(null)}
        />
      )}

      {printingOrder && (
        <CustomerOrderPrintModal
          open={Boolean(printingOrder)}
          order={printingOrder}
          customer={customer}
          machines={[...(customer.machines || []), ...(stockMachines || [])]}
          companyInfo={companyInfo}
          onClose={() => setPrintingOrder(null)}
        />
      )}

      {createLocationModalOpen && (
        <CustomerLocationModal
          open={createLocationModalOpen}
          customerId={customer.id}
          customerName={customer.name}
          onClose={() => setCreateLocationModalOpen(false)}
          onSuccess={() => router.refresh()}
        />
      )}

      {handoverEquipment && (
        <EquipmentHandoverModal
          open={Boolean(handoverEquipment)}
          equipment={handoverEquipment}
          companyInfo={companyInfo}
          onClose={() => setHandoverEquipment(null)}
        />
      )}

      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmText={confirmDialog.confirmText}
        danger={confirmDialog.danger}
        onClose={() => setConfirmDialog((prev) => ({ ...prev, open: false }))}
        onConfirm={async () => {
          const fn = confirmDialog.onConfirm;
          setConfirmDialog((prev) => ({ ...prev, open: false }));
          await fn();
        }}
      />
    </div>
  );
}
