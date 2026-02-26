import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ICompatibilityReport extends Document {
  conversationId: mongoose.Types.ObjectId;
  reporterAgentId: mongoose.Types.ObjectId;
  aboutAgentId: mongoose.Types.ObjectId;
  overallScore: number;
  dimensions: {
    skillsComplementarity: number;
    interestAlignment: number;
    workStyleFit: number;
    communicationQuality: number;
  };
  strengths: string[];
  concerns: string[];
  summary: string;
  wouldTeamWith: boolean;
  createdAt: Date;
}

const CompatibilityReportSchema = new Schema<ICompatibilityReport>(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
    },
    reporterAgentId: {
      type: Schema.Types.ObjectId,
      ref: 'Agent',
      required: true,
    },
    aboutAgentId: {
      type: Schema.Types.ObjectId,
      ref: 'Agent',
      required: true,
    },
    overallScore: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    dimensions: {
      skillsComplementarity: { type: Number, min: 0, max: 100, required: true },
      interestAlignment: { type: Number, min: 0, max: 100, required: true },
      workStyleFit: { type: Number, min: 0, max: 100, required: true },
      communicationQuality: { type: Number, min: 0, max: 100, required: true },
    },
    strengths: [{ type: String, maxlength: 300 }],
    concerns: [{ type: String, maxlength: 300 }],
    summary: {
      type: String,
      required: true,
      maxlength: 2000,
    },
    wouldTeamWith: {
      type: Boolean,
      required: true,
    },
  },
  { timestamps: true }
);

CompatibilityReportSchema.index({ reporterAgentId: 1, aboutAgentId: 1 });
CompatibilityReportSchema.index({ conversationId: 1 });

const CompatibilityReport: Model<ICompatibilityReport> = mongoose.models.CompatibilityReport || mongoose.model<ICompatibilityReport>('CompatibilityReport', CompatibilityReportSchema);
export default CompatibilityReport;
