import { Timestamp } from 'firebase/firestore';

export type UserRole = 'admin' | 'member';
export type UserStatus = 'pending' | 'active' | 'suspended' | 'removed';
export type MealType = 'breakfast' | 'lunch' | 'dinner';
export type MealStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type TransactionType = 'deposit' | 'meal_charge' | 'expense' | 'refund' | 'adjustment';
export type TransactionStatus = 'completed' | 'reversed';
export type DepositStatus = 'pending' | 'approved' | 'rejected';
export type PaymentMethod = 'bkash' | 'nagad' | 'rocket' | 'bank' | 'cash';
export type ExpenseCategory =
  | 'Grocery'
  | 'Gas'
  | 'Electricity'
  | 'Wi-Fi'
  | 'Water'
  | 'Cleaning'
  | 'Maintenance'
  | 'Other';
export type AllocationType = 'equal' | 'selected' | 'general';
export type AlertLevel = 'none' | 'low' | 'critical' | 'zero';

export interface AdminBootstrap {
  adminUid: string;
  adminEmail: string;
  initializedAt: Timestamp;
}

export interface MessSettings {
  messName: string;
  messLogo?: string;
  currency: 'BDT';
  timezone: 'Asia/Dhaka';
  openingDate?: string;
  breakfastRate: number; // integer poisha
  lunchRate: number;     // integer poisha
  dinnerRate: number;    // integer poisha
  lowBalanceThreshold: number;
  criticalBalanceThreshold: number;
  zeroBalanceNotificationEnabled: boolean;
  memberMealEntryEnabled: boolean;
  automaticMealApproval: boolean;
  notificationSettings?: {
    mealAlerts?: boolean;
    depositAlerts?: boolean;
    expenseAlerts?: boolean;
  };
  updatedAt: Timestamp;
}

export interface AdminSettings {
  whatsappEnabled: boolean;
  whatsappPhoneNumberId?: string;
  whatsappBusinessAccountId?: string;
  whatsappConsentRequired: boolean;
  fcmEnabled: boolean;
  updatedAt: Timestamp;
}

export interface UserProfile {
  uid: string;
  fullName: string;
  email?: string;
  phoneNumber?: string;
  profileImage?: string;
  role: UserRole;
  status: UserStatus;
  joiningDate: string;
  fcmToken?: string;
  whatsappConsent?: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface MealRate {
  id?: string;
  mealType: MealType;
  amountInPoisha: number;
  effectiveFrom: string;
  createdAt: Timestamp;
  createdBy: string;
}

export interface MealEntry {
  id?: string;
  memberId: string;
  mealDate: string; // YYYY-MM-DD
  mealType: MealType;
  quantity: number;
  unitRateInPoisha: number;
  totalAmountInPoisha: number;
  status: MealStatus;
  createdBy: string;
  approvedBy?: string;
  createdAt: Timestamp;
  approvedAt?: Timestamp;
  updatedAt: Timestamp;
}

export interface Wallet {
  memberId: string;
  openingBalanceInPoisha: number;
  currentBalanceInPoisha: number;
  totalDepositsInPoisha: number;
  totalMealCostsInPoisha: number;
  totalExpensesInPoisha: number;
  totalRefundsInPoisha: number;
  previousBalanceInPoisha?: number;
  balanceFinishedAt?: Timestamp;
  lastAlertLevel?: AlertLevel;
  updatedAt: Timestamp;
}

export interface TransactionRecord {
  id?: string;
  memberId: string;
  type: TransactionType;
  amountInPoisha: number;
  description: string;
  paymentMethod?: string;
  referenceId?: string;
  createdBy: string;
  createdAt: Timestamp;
  status: TransactionStatus;
  reversalOf?: string;
}

export interface DepositRequest {
  id?: string;
  memberId: string;
  amountInPoisha: number;
  paymentMethod: PaymentMethod | string;
  transactionId: string;
  receiptImage?: string;
  status: DepositStatus;
  createdAt: Timestamp;
  reviewedAt?: Timestamp;
  reviewedBy?: string;
}

export interface ExpenseRecord {
  id?: string;
  category: ExpenseCategory;
  amountInPoisha: number;
  description: string;
  receiptImage?: string;
  expenseDate: string;
  allocationType: AllocationType;
  allocatedMemberIds: string[];
  createdBy: string;
  createdAt: Timestamp;
}

export interface NotificationRecord {
  id?: string;
  recipientUid: string;
  title: string;
  message: string;
  category: string;
  isRead: boolean;
  createdAt: Timestamp;
}

export interface NoticeRecord {
  id?: string;
  title: string;
  description: string;
  targetType: 'all' | 'selected';
  targetMemberIds: string[];
  published: boolean;
  createdAt: Timestamp;
  createdBy: string;
}

export interface MonthlyReportRecord {
  id?: string;
  memberId: string;
  month: number;
  year: number;
  totalBreakfast: number;
  totalLunch: number;
  totalDinner: number;
  totalMealCostInPoisha: number;
  totalDepositsInPoisha: number;
  totalExpensesInPoisha: number;
  openingBalanceInPoisha: number;
  closingBalanceInPoisha: number;
  generatedAt: Timestamp;
}

export interface AuditLogRecord {
  id?: string;
  actorUid: string;
  action: string;
  targetType: string;
  targetId: string;
  timestamp: Timestamp;
  previousValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
}
