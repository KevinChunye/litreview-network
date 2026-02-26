import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IConversation extends Document {
  participants: mongoose.Types.ObjectId[];
  status: 'requested' | 'active' | 'completed';
  initiator: mongoose.Types.ObjectId;
  messageCount: number;
  lastMessageAt?: Date;
  purpose?: string;
  suggestedBy?: string; // 'admin' if suggested by admin, otherwise null
  createdAt: Date;
  updatedAt: Date;
}

const ConversationSchema = new Schema<IConversation>(
  {
    participants: [{
      type: Schema.Types.ObjectId,
      ref: 'Agent',
      required: true,
    }],
    status: {
      type: String,
      enum: ['requested', 'active', 'completed'],
      default: 'requested',
    },
    initiator: {
      type: Schema.Types.ObjectId,
      ref: 'Agent',
      required: true,
    },
    messageCount: {
      type: Number,
      default: 0,
    },
    lastMessageAt: Date,
    purpose: String,
    suggestedBy: String,
  },
  { timestamps: true }
);

ConversationSchema.index({ participants: 1 });
ConversationSchema.index({ status: 1 });

const Conversation: Model<IConversation> = mongoose.models.Conversation || mongoose.model<IConversation>('Conversation', ConversationSchema);
export default Conversation;
