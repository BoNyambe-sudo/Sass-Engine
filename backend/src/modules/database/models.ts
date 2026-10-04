import { Document, Schema, Types } from 'mongoose';

export type Role = 'ADMIN' | 'MANAGER' | 'VIEWER';

export interface User extends Document {
  name: string;
  email: string;
  passwordHash: string;
  emailVerifiedAt: Date | null;
  createdAt: Date;
}

export interface Organization extends Document {
  name: string;
  slug: string;
  ownerId: Types.ObjectId;
  createdAt: Date;
}

export interface Membership extends Document {
  userId: Types.ObjectId;
  organizationId: Types.ObjectId;
  role: Role;
  createdAt: Date;
}

export interface RefreshSession extends Document {
  userId: Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

export interface OneTimeToken extends Document {
  userId: Types.ObjectId;
  tokenHash: string;
  type: 'verify-email' | 'reset-password';
  expiresAt: Date;
  consumedAt: Date | null;
}

export interface Invitation extends Document {
  organizationId: Types.ObjectId;
  email: string;
  role: Role;
  tokenHash: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  invitedBy: Types.ObjectId;
  createdAt: Date;
}

export interface Subscription extends Document {
  organizationId: Types.ObjectId;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  plan: string;
  status: string;
  amountCents: number;
  currency: string;
  currentPeriodEnd: Date | null;
  canceledAt: Date | null;
}

export interface AuditLog extends Document {
  organizationId: Types.ObjectId;
  actorId: Types.ObjectId | null;
  action: string;
  targetType: string;
  targetId: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface StripeEvent extends Document {
  eventId: string;
  type: string;
  processedAt: Date;
  status: 'processing' | 'processed';
  lockedUntil: Date;
}

const userSchema = new Schema<User>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      unique: true,
      maxlength: 254,
    },
    passwordHash: { type: String, required: true, select: false },
    emailVerifiedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

const organizationSchema = new Schema<Organization>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, unique: true, lowercase: true },
    ownerId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

const membershipSchema = new Schema<Membership>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    organizationId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'Organization',
    },
    role: {
      type: String,
      enum: ['ADMIN', 'MANAGER', 'VIEWER'],
      required: true,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
membershipSchema.index({ userId: 1, organizationId: 1 }, { unique: true });
membershipSchema.index({ organizationId: 1, createdAt: -1 });

const refreshSessionSchema = new Schema<RefreshSession>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    tokenHash: { type: String, required: true, unique: true, select: false },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
refreshSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const oneTimeTokenSchema = new Schema<OneTimeToken>({
  userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  tokenHash: { type: String, required: true, unique: true, select: false },
  type: {
    type: String,
    enum: ['verify-email', 'reset-password'],
    required: true,
  },
  expiresAt: { type: Date, required: true },
  consumedAt: { type: Date, default: null },
});
oneTimeTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const invitationSchema = new Schema<Invitation>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'Organization',
    },
    email: { type: String, required: true, lowercase: true, trim: true },
    role: {
      type: String,
      enum: ['ADMIN', 'MANAGER', 'VIEWER'],
      required: true,
    },
    tokenHash: { type: String, required: true, unique: true, select: false },
    expiresAt: { type: Date, required: true },
    acceptedAt: { type: Date, default: null },
    invitedBy: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
invitationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
invitationSchema.index({ organizationId: 1, email: 1 });

const subscriptionSchema = new Schema<Subscription>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      required: true,
      unique: true,
      ref: 'Organization',
    },
    stripeCustomerId: {
      type: String,
      default: null,
      index: true,
      sparse: true,
    },
    stripeSubscriptionId: {
      type: String,
      default: null,
      index: true,
      sparse: true,
    },
    plan: { type: String, default: 'free' },
    status: { type: String, default: 'inactive' },
    amountCents: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: 'usd' },
    currentPeriodEnd: { type: Date, default: null },
    canceledAt: { type: Date, default: null },
  },
  { timestamps: true },
);

const auditLogSchema = new Schema<AuditLog>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'Organization',
      index: true,
    },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    action: { type: String, required: true },
    targetType: { type: String, required: true },
    targetId: { type: String, default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
auditLogSchema.index({ organizationId: 1, createdAt: -1 });

const stripeEventSchema = new Schema<StripeEvent>({
  eventId: { type: String, required: true, unique: true },
  type: { type: String, required: true },
  processedAt: { type: Date, default: Date.now },
  status: {
    type: String,
    enum: ['processing', 'processed'],
    default: 'processing',
  },
  lockedUntil: { type: Date, default: Date.now },
});

export const modelSchemas = {
  User: userSchema,
  Organization: organizationSchema,
  Membership: membershipSchema,
  RefreshSession: refreshSessionSchema,
  OneTimeToken: oneTimeTokenSchema,
  Invitation: invitationSchema,
  Subscription: subscriptionSchema,
  AuditLog: auditLogSchema,
  StripeEvent: stripeEventSchema,
};
