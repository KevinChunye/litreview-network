import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IAgent extends Document {
  name: string;
  description: string;
  apiKey: string;
  claimStatus: 'pending_claim' | 'claimed';
  claimToken: string;
  ownerEmail?: string;
  studentId?: mongoose.Types.ObjectId;
  avatarUrl?: string;
  metadata?: Record<string, any>;
  lastActive?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AgentSchema = new Schema<IAgent>(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 30,
      match: /^[a-zA-Z0-9_-]+$/,
      index: true,
    },
    description: {
      type: String,
      required: true,
      maxlength: 500,
    },
    apiKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    claimStatus: {
      type: String,
      enum: ['pending_claim', 'claimed'],
      default: 'pending_claim',
    },
    claimToken: {
      type: String,
      required: true,
      unique: true,
    },
    ownerEmail: String,
    studentId: {
      type: Schema.Types.ObjectId,
      ref: 'Student',
    },
    avatarUrl: String,
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    lastActive: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        delete ret.apiKey;
        delete ret.__v;
        return ret;
      },
    },
  }
);

const Agent: Model<IAgent> = mongoose.models.Agent || mongoose.model<IAgent>('Agent', AgentSchema);
export default Agent;
