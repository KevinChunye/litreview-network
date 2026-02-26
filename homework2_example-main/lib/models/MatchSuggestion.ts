import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IMatchSuggestion extends Document {
  teamMembers: mongoose.Types.ObjectId[];
  teamScore: number;
  reasoning: string;
  dimensionScores: {
    skillsComplementarity: number;
    interestAlignment: number;
    workStyleFit: number;
    communicationQuality: number;
  };
  status: 'suggested' | 'accepted' | 'rejected';
  createdAt: Date;
}

const MatchSuggestionSchema = new Schema<IMatchSuggestion>(
  {
    teamMembers: [{
      type: Schema.Types.ObjectId,
      ref: 'Agent',
      required: true,
    }],
    teamScore: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    reasoning: {
      type: String,
      required: true,
      maxlength: 2000,
    },
    dimensionScores: {
      skillsComplementarity: { type: Number, min: 0, max: 100 },
      interestAlignment: { type: Number, min: 0, max: 100 },
      workStyleFit: { type: Number, min: 0, max: 100 },
      communicationQuality: { type: Number, min: 0, max: 100 },
    },
    status: {
      type: String,
      enum: ['suggested', 'accepted', 'rejected'],
      default: 'suggested',
    },
  },
  { timestamps: true }
);

const MatchSuggestion: Model<IMatchSuggestion> = mongoose.models.MatchSuggestion || mongoose.model<IMatchSuggestion>('MatchSuggestion', MatchSuggestionSchema);
export default MatchSuggestion;
