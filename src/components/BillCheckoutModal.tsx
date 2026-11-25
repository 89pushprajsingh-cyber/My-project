import React, { useMemo, useState } from 'react';
import { User } from 'firebase/auth';
import { collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Banknote, CheckCircle2, CreditCard, MapPin, Receipt, X } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  BillLineItem,
  BillPaymentMethod,
  ServiceBill,
  ServiceListing,
  VALIDATION_LIMITS,
} from '../types';

interface BillCheckoutModalProps {
  user: User;
  service: ServiceListing;
  items: BillLineItem[];
  onClose: () => void;
  onBillCreated: (bill: ServiceBill) => void;
}

function generateCode(prefix: string): string {
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `${prefix}-${rand}`;
}

export function BillCheckoutModal({
  user,
  service,
  items,
  onClose,
  onBillCreated,
}: BillCheckoutModalProps) {
  const [paymentMethod, setPaymentMethod] = useState<BillPaymentMethod>('in_app');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const subtotal = useMemo(
    () =>
      Number(
        items.reduce((acc, item) => acc + Number(item.lineTotal || 0), 0).toFixed(2)
      ),
    [items]
  );
  const taxAmount = 0;
  const totalAmount = Number((subtotal + taxAmount).toFixed(2));

  const handleConfirmOrderAndBill = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (items.length === 0) {
      setErrorMsg('Please select at least one item from the menu.');
      return;
    }

    const sanitizedItems: BillLineItem[] = items
      .slice(0, VALIDATION_LIMITS.CATALOG_MAX_COUNT)
      .map((item) => {
        const qty = Math.min(99, Math.max(1, Math.round(item.quantity)));
        const unitPrice = Math.min(1000000, Math.max(0, Number(item.unitPrice)));
        const lineTotal = Number((qty * unitPrice).toFixed(2));
        return {
          name: item.name.trim().slice(0, VALIDATION_LIMITS.SERVICE_ITEM_MAX),
          itemType: (item.itemType || service.category).trim().slice(0, VALIDATION_LIMITS.ITEM_TYPE_MAX),
          unit: (item.unit || '1 unit').trim().slice(0, VALIDATION_LIMITS.ITEM_UNIT_MAX),
          quantity: qty,
          unitPrice,
          lineTotal,
        };
      });

    const billRef = doc(collection(db, 'bills'));
    const billNumber = generateCode('NC');
    const isPaidInApp = paymentMethod === 'in_app';
    const receiptCode = isPaidInApp ? generateCode('RCPT') : '';

    const payload = {
      billNumber,
      seekerId: user.uid,
      seekerName: (user.displayName || user.email || 'Customer').slice(
        0,
        VALIDATION_LIMITS.DISPLAY_NAME_MAX
      ),
      providerId: service.ownerId,
      shopName: service.shopName.slice(0, VALIDATION_LIMITS.SHOP_NAME_MAX),
      shopAddress: service.address.slice(0, VALIDATION_LIMITS.ADDRESS_MAX),
      items: sanitizedItems,
      subtotal,
      taxAmount,
      totalAmount,
      paymentMethod,
      paymentStatus: isPaidInApp ? ('paid' as const) : ('pending_counter' as const),
      receiptCode,
      notes: notes.trim().slice(0, VALIDATION_LIMITS.BILL_NOTES_MAX),
      appointmentId: '',
      ...(isPaidInApp ? { paidAt: serverTimestamp() } : {}),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    setIsSubmitting(true);
    try {
      await setDoc(billRef, payload);
      onBillCreated({
        id: billRef.id,
        billNumber: payload.billNumber,
        seekerId: payload.seekerId,
        seekerName: payload.seekerName,
        providerId: payload.providerId,
        shopName: payload.shopName,
        shopAddress: payload.shopAddress,
        items: payload.items,
        subtotal: payload.subtotal,
        taxAmount: payload.taxAmount,
        totalAmount: payload.totalAmount,
        paymentMethod: payload.paymentMethod,
        paymentStatus: payload.paymentStatus,
        receiptCode: payload.receiptCode,
        notes: payload.notes,
        appointmentId: payload.appointmentId,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Missing or insufficient permissions')) {
        handleFirestoreError(err, OperationType.CREATE, `bills/${billRef.id}`);
      }
      setErrorMsg('Unable to generate your bill right now. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-label={`Order bill for ${service.shopName}`}
    >
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-900 truncate flex items-center gap-2">
              <Receipt className="w-4 h-4 text-blue-700 shrink-0" />
              <span>Review Bill & Payment</span>
            </h2>
            <p className="text-xs text-slate-500 truncate mt-0.5 flex items-center gap-1">
              <span className="font-medium text-slate-700">{service.shopName}</span>
              <span aria-hidden="true">·</span>
              <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
              <span className="truncate">{service.address}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close bill checkout"
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleConfirmOrderAndBill} className="flex-1 overflow-y-auto p-5 space-y-5">
          {errorMsg && (
            <div
              role="alert"
              className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700"
            >
              {errorMsg}
            </div>
          )}

          {/* Itemized Bill Table */}
          <div>
            <p className="text-xs font-semibold text-slate-700 mb-2">
              Itemized Summary
            </p>
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="py-2 px-3 font-medium">#</th>
                    <th className="py-2 px-3 font-medium">Item & Type</th>
                    <th className="py-2 px-3 font-medium text-right">Qty</th>
                    <th className="py-2 px-3 font-medium text-right">Price</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item, idx) => (
                    <tr key={`${item.name}-${idx}`}>
                      <td className="py-2.5 px-3 font-mono tabular-nums text-slate-400">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-3">
                        <p className="font-medium text-slate-900">{item.name}</p>
                        <p className="text-[11px] text-slate-500">
                          {item.itemType}
                          {item.unit ? ` · ${item.unit}` : ''} · ₹{item.unitPrice} each
                        </p>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                        {item.quantity}
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
                  <span className="font-mono tabular-nums">₹{subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Platform Fee</span>
                  <span className="font-mono tabular-nums">₹0.00</span>
                </div>
                <div className="flex justify-between text-sm font-bold text-slate-900 pt-1.5 border-t border-slate-200">
                  <span>Total Payable</span>
                  <span className="font-mono tabular-nums">₹{totalAmount.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Optional Order Notes */}
          <div>
            <label
              htmlFor="bill-notes"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              Order / Service Notes (optional)
            </label>
            <input
              id="bill-notes"
              type="text"
              maxLength={VALIDATION_LIMITS.BILL_NOTES_MAX}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g., Serve hot, dining in, or pick up at counter"
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
            />
          </div>

          {/* Payment Method Selection */}
          <div>
            <p className="text-xs font-semibold text-slate-700 mb-2">
              Choose How to Pay
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setPaymentMethod('in_app')}
                className={`text-left p-3.5 rounded-xl border transition-all ${
                  paymentMethod === 'in_app'
                    ? 'border-blue-700 bg-blue-50/50 ring-2 ring-blue-600/20'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <CreditCard className="w-4 h-4 text-blue-700" />
                  {paymentMethod === 'in_app' && (
                    <CheckCircle2 className="w-4 h-4 text-blue-700" />
                  )}
                </div>
                <p className="mt-2 text-xs font-semibold text-slate-900">
                  Pay Through App
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500 leading-relaxed">
                  Pay ₹{totalAmount.toFixed(0)} now and get an instant verified payment receipt.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('counter')}
                className={`text-left p-3.5 rounded-xl border transition-all ${
                  paymentMethod === 'counter'
                    ? 'border-blue-700 bg-blue-50/50 ring-2 ring-blue-600/20'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <Banknote className="w-4 h-4 text-emerald-700" />
                  {paymentMethod === 'counter' && (
                    <CheckCircle2 className="w-4 h-4 text-blue-700" />
                  )}
                </div>
                <p className="mt-2 text-xs font-semibold text-slate-900">
                  Pay Direct at Counter
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500 leading-relaxed">
                  Generate your bill now, pay cash/UPI at the counter, and receive your receipt in-app.
                </p>
              </button>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap"
            >
              {isSubmitting
                ? 'Processing...'
                : paymentMethod === 'in_app'
                  ? `Pay ₹${totalAmount.toFixed(0)} & Get Receipt`
                  : 'Generate Counter Bill'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
