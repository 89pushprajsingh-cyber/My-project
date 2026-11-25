import React, { useMemo, useState } from 'react';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import {
  CheckCircle2,
  Clock,
  CreditCard,
  Receipt,
  Star,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { ServiceBill, UserRole } from '../types';
import { BillReceiptModal } from './BillReceiptModal';

interface BillsViewProps {
  mode: UserRole;
  bills: ServiceBill[];
  reviewedRatingsBySourceId: Record<string, number>;
  onOpenReviewForBill: (bill: ServiceBill) => void;
  onPrimaryAction: () => void;
}

export function BillsView({
  mode,
  bills,
  reviewedRatingsBySourceId,
  onOpenReviewForBill,
  onPrimaryAction,
}: BillsViewProps) {
  const [selectedBillId, setSelectedBillId] = useState<string | null>(null);
  const [updatingBillId, setUpdatingBillId] = useState<string | null>(null);
  const isProviderMode = mode === 'provider';

  const summary = useMemo(() => {
    let paidTotal = 0;
    let paidCount = 0;
    let pendingCount = 0;
    for (const bill of bills) {
      if (bill.paymentStatus === 'paid') {
        paidTotal += bill.totalAmount;
        paidCount += 1;
      } else {
        pendingCount += 1;
      }
    }
    return { paidTotal, paidCount, pendingCount };
  }, [bills]);

  const selectedBill = useMemo(
    () => bills.find((b) => b.id === selectedBillId) || null,
    [bills, selectedBillId]
  );

  const handlePayInApp = async (bill: ServiceBill) => {
    setUpdatingBillId(bill.id);
    const receiptCode = `RCPT-${Math.floor(100000 + Math.random() * 900000)}`;
    try {
      await updateDoc(doc(db, 'bills', bill.id), {
        paymentMethod: 'in_app',
        paymentStatus: 'paid',
        receiptCode,
        paidAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `bills/${bill.id}`);
    } finally {
      setUpdatingBillId(null);
    }
  };

  const handleConfirmCounterPaid = async (bill: ServiceBill) => {
    setUpdatingBillId(bill.id);
    const receiptCode = `CTR-${Math.floor(100000 + Math.random() * 900000)}`;
    try {
      await updateDoc(doc(db, 'bills', bill.id), {
        paymentStatus: 'paid',
        receiptCode,
        paidAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `bills/${bill.id}`);
    } finally {
      setUpdatingBillId(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
      <div className="pb-5 border-b border-slate-200 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            {isProviderMode ? 'Bills & Counter Sales' : 'My Bills & Receipts'}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {isProviderMode
              ? 'View customer orders, paid app receipts, and confirm direct counter payments.'
              : 'Access your itemized bills, pay online or at the shop counter, and keep digital payment receipts.'}
          </p>
        </div>
        <button
          type="button"
          onClick={onPrimaryAction}
          className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg whitespace-nowrap shrink-0"
        >
          {isProviderMode ? 'Shop Dashboard' : 'Browse Services'}
        </button>
      </div>

      {/* Tabular Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500">
            {isProviderMode ? 'Collected Revenue' : 'Total Paid in App & Counter'}
          </p>
          <p className="mt-1.5 text-xl font-bold text-slate-900 font-mono tabular-nums">
            ₹{summary.paidTotal.toFixed(0)}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500">Paid Receipts</p>
          <p className="mt-1.5 text-xl font-bold text-emerald-700 font-mono tabular-nums">
            {summary.paidCount}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500">Pending at Counter</p>
          <p className="mt-1.5 text-xl font-bold text-amber-700 font-mono tabular-nums">
            {summary.pendingCount}
          </p>
        </div>
      </div>

      {bills.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
          <Receipt className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <h2 className="text-base font-semibold text-slate-900">
            {isProviderMode ? 'No bills generated yet' : 'No bills or receipts yet'}
          </h2>
          <p className="mt-1 text-sm text-slate-500 max-w-md mx-auto">
            {isProviderMode
              ? 'When customers order menu items or pay for services, their itemized bills and receipts appear here.'
              : 'Select items from any cafe or local shop on the map to generate a digital bill and pay online or at the counter.'}
          </p>
          <button
            type="button"
            onClick={onPrimaryAction}
            className="mt-5 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold rounded-lg"
          >
            {isProviderMode ? 'Open Shop Dashboard' : 'Explore Nearby Shops'}
          </button>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
          {bills.map((bill) => {
            const isPaid = bill.paymentStatus === 'paid';
            const isBusy = updatingBillId === bill.id;
            const itemSummary = bill.items
              .map((i) => `${i.quantity} × ${i.name}`)
              .join(', ');
            const reviewedRating = reviewedRatingsBySourceId[bill.id];

            return (
              <div
                key={bill.id}
                className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900">
                      {isProviderMode ? bill.seekerName : bill.shopName}
                    </span>
                    <span className="text-slate-300" aria-hidden="true">·</span>
                    <span className="text-xs font-mono tabular-nums text-slate-500">
                      {bill.billNumber}
                    </span>
                    <span className="text-slate-300" aria-hidden="true">·</span>
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-semibold ${
                        isPaid ? 'text-emerald-700' : 'text-amber-700'
                      }`}
                    >
                      {isPaid ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : (
                        <Clock className="w-3.5 h-3.5" />
                      )}
                      <span>
                        {isPaid
                          ? bill.paymentMethod === 'in_app'
                            ? 'Paid in App'
                            : 'Paid at Counter'
                          : 'Due at Counter'}
                      </span>
                    </span>
                  </div>

                  <p className="text-xs text-slate-700 truncate">{itemSummary}</p>
                  <p className="text-xs text-slate-500 font-mono tabular-nums">
                    Total: ₹{bill.totalAmount.toFixed(2)}
                    {bill.receiptCode ? ` · Receipt ${bill.receiptCode}` : ''}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {!isPaid && !isProviderMode && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handlePayInApp(bill)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg whitespace-nowrap"
                    >
                      <CreditCard className="w-3.5 h-3.5" />
                      <span>{isBusy ? 'Paying...' : `Pay ₹${bill.totalAmount.toFixed(0)}`}</span>
                    </button>
                  )}

                  {!isPaid && isProviderMode && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleConfirmCounterPaid(bill)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 rounded-lg whitespace-nowrap"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{isBusy ? 'Saving...' : 'Mark Paid'}</span>
                    </button>
                  )}

                  {isPaid && !isProviderMode && (
                    reviewedRating !== undefined ? (
                      <span className="inline-flex items-center gap-1 px-2 text-xs font-medium text-amber-700 font-mono tabular-nums whitespace-nowrap">
                        <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                        <span>Reviewed · {reviewedRating}.0</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onOpenReviewForBill(bill)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 rounded-lg whitespace-nowrap"
                      >
                        <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                        <span>Rate Shop</span>
                      </button>
                    )
                  )}

                  <button
                    type="button"
                    onClick={() => setSelectedBillId(bill.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg whitespace-nowrap"
                  >
                    <Receipt className="w-3.5 h-3.5" />
                    <span>View Bill</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedBill && (
        <BillReceiptModal
          bill={selectedBill}
          viewerRole={mode}
          isReviewed={reviewedRatingsBySourceId[selectedBill.id] !== undefined}
          onClose={() => setSelectedBillId(null)}
          onRateShop={(billToReview) => {
            setSelectedBillId(null);
            onOpenReviewForBill(billToReview);
          }}
        />
      )}
    </div>
  );
}
