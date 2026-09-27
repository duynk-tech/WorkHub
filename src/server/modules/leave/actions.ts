'use server';

import * as internal from './internal-actions';
export type { Result } from './internal-actions';

export async function previewLeaveDaysAction(startDate: string, endDate: string, durationType: string) {
  return internal.previewLeaveDaysAction(startDate, endDate, durationType);
}

export async function submitLeaveAction(id: number | null, raw: unknown) {
  return internal.submitLeaveAction(id, raw);
}

export async function approveLeaveAction(approvalTaskId: number, decision: 'APPROVE' | 'REJECT', comment?: string) {
  return internal.approveLeaveAction(approvalTaskId, decision, comment);
}

export async function cancelLeaveAction(requestId: number, reason?: string) {
  return internal.cancelLeaveAction(requestId, reason);
}

export async function deleteLeaveAction(requestId: number) {
  return internal.deleteLeaveAction(requestId);
}

export async function updateBalanceAction(raw: unknown) {
  return internal.updateBalanceAction(raw);
}
