import React, { useState } from 'react';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import {
  CheckCircle2,
  Clock,
  CreditCard,
  MapPin,
  Printer,
  Receipt,
  Star,
  X,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { ServiceBill, UserRole } from '../types';

interface BillReceiptModalProps {
  bill: ServiceBill;
  viewerRole: UserRole;
  isReviewed?: boolean;
  onClose: () => void;
  onRateShop?: (bill: ServiceBill) => void;
}

function formatBillDate(ts: unknown): string {
  if (
    ts &&
    typeof ts === 'object' &&
    'toDate' in ts &&
    typeof (ts as { toDate: () => Date }).toDate === 'function'
  ) {
    return (ts as { toDate: () => Date }).toDate().toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  return 'Just now';
}

export function BillReceiptModal({
  bill,
  viewerRole,
  isReviewed = false,
  onClose,
  onRateShop,
}: BillReceiptModalProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isPaid = bill.paymentStatus === 'paid';

  const handlePayInAppNow = async () => {
    setErrorMsg(null);
    setIsUpdating(true);
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
      setErrorMsg('Unable to complete in-app payment.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleConfirmCounterPayment = async () => {
    setErrorMsg(null);
    setIsUpdating(true);
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
      setErrorMsg('Unable to confirm counter payment.');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-label={`Bill ${bill.billNumber}`}
    >
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <Receipt className="w-4 h-4 text-blue-700 shrink-0" />
            <h2 className="text-base font-bold text-slate-900 truncate">
              {isPaid ? 'Digital Payment Receipt' : 'Counter Payment Bill'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close receipt"
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {errorMsg && (
            <div
              role="alert"
              className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700"
            >
              {errorMsg}
            </div>
          )}

          {/* Status Summary */}
          <div
            className={`p-3.5 rounded-lg border flex items-start gap-3 ${
              isPaid
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-amber-50 border-amber-200 text-amber-900'
            }`}
          >
            {isPaid ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            )}
            <div className="text-xs space-y-0.5">
              <p className="font-semibold">
                {isPaid
                  ? bill.paymentMethod === 'in_app'
                    ? 'Paid Through App'
                    : 'Paid Direct at Counter'
                  : 'Pending Counter Payment'}
              </p>
              <p className="text-[11px] opacity-90">
                {isPaid
                  ? `Receipt ${bill.receiptCode} · Settled ${formatBillDate(bill.paidAt || bill.updatedAt)}`
                  : viewerRole === 'seeker'
                    ? `Show Bill ${bill.billNumber} at the counter when paying, or pay through the app below.`
                    : 'Customer opted to pay at the counter. Mark received once settled.'}
              </p>
            </div>
          </div>

          {/* Merchant & Bill Metadata */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs pb-4 border-b border-slate-100">
            <div>
              <p className="text-slate-400 mb-0.5">Service Provider</p>
              <p className="font-semibold text-slate-900">{bill.shopName}</p>
              <p className="text-slate-600 mt-0.5 flex items-start gap-1">
                <MapPin className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
                <span>{bill.shopAddress}</span>
              </p>
            </div>
            <div className="sm:text-right">
              <p className="text-slate-400 mb-0.5">Bill Reference</p>
              <p className="font-mono tabular-nums font-semibold text-slate-900">
                {bill.billNumber}
              </p>
              <p className="text-slate-600 mt-0.5">Customer: {bill.seekerName}</p>
              <p className="text-slate-400 font-mono tabular-nums mt-0.5">
                {formatBillDate(bill.createdAt)}
              </p>
            </div>
          </div>

          {/* Line Items */}
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="py-2 px-3 font-medium">Item</th>
                  <th className="py-2 px-3 font-medium text-right">Qty</th>
                  <th className="py-2 px-3 font-medium text-right">Rate</th>
                  <th className="py-2 px-3 font-medium text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bill.items.map((item, idx) => (
                  <tr key={`${item.name}-${idx}`}>
                    <td className="py-2.5 px-3">
                      <p className="font-medium text-slate-900">{item.name}</p>
                      <p className="text-[11px] text-slate-500">
                        {item.itemType}
                        {item.unit ? ` · ${item.unit}` : ''}
                      </p>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                      {item.quantity}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600">
                      ₹{item.unitPrice}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                      ₹{item.lineTotal.toFixed(0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="bg-slate-50/70 border-t border-slate-200 px-3 py-2.5 space-y-1 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span className="font-mono tabular-nums">₹{bill.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Taxes & Charges</span>
                <span className="font-mono tabular-nums">₹{bill.taxAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-slate-900 pt-1.5 border-t border-slate-200">
                <span>{isPaid ? 'Amount Paid' : 'Amount Due at Counter'}</span>
                <span className="font-mono tabular-nums">₹{bill.totalAmount.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {bill.notes && (
            <p className="text-xs text-slate-600">
              <span className="font-medium text-slate-800">Notes: </span>
              {bill.notes}
            </p>
          )}
        </div>

        <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2.5">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Bill</span>
          </button>

          <div className="flex flex-wrap items-center gap-2">
            {!isPaid && viewerRole === 'seeker' && (
              <button
                type="button"
                disabled={isUpdating}
                onClick={() => void handlePayInAppNow()}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap"
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span>{isUpdating ? 'Paying...' : `Pay ₹${bill.totalAmount.toFixed(0)} in App`}</span>
              </button>
            )}

            {!isPaid && viewerRole === 'provider' && (
              <button
                type="button"
                disabled={isUpdating}
                onClick={() => void handleConfirmCounterPayment()}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{isUpdating ? 'Updating...' : 'Confirm Counter Payment'}</span>
              </button>
            )}

            {isPaid && viewerRole === 'seeker' && !isReviewed && onRateShop && (
              <button
                type="button"
                onClick={() => onRateShop(bill)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-amber-900 bg-amber-100 hover:bg-amber-200 rounded-lg transition-colors whitespace-nowrap"
              >
                <Star className="w-3.5 h-3.5 text-amber-600 fill-amber-500" />
                <span>Rate & Review</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-700 hover:text-slate-900"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
