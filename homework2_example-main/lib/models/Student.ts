import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IStudent extends Document {
  agentId: mongoose.Types.ObjectId;
  displayName: string;
  university: string;
  major: string;
  year: string;
  skills: string[];
  interests: string[];
  lookingFor: string[];
  workStyle: string;
  bio: string;
  teamPreferences: {
    minSize: number;
    maxSize: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const StudentSchema = new Schema<IStudent>(
  {
    agentId: {
      type: Schema.Types.ObjectId,
      ref: 'Agent',
      required: true,
      unique: true,
    },
    displayName: {
      type: String,
      required: true,
      maxlength: 100,
    },
    university: {
      type: String,
      enum: ['MIT', 'Harvard', 'other'],
      default: 'other',
    },
    major: {
      type: String,
      maxlength: 200,
    },
    year: {
      type: String,
      maxlength: 50,
    },
    skills: [{ type: String, maxlength: 100 }],
    interests: [{ type: String, maxlength: 100 }],
    lookingFor: [{ type: String, maxlength: 200 }],
    workStyle: {
      type: String,
      maxlength: 500,
    },
    bio: {
      type: String,
      maxlength: 1000,
    },
    teamPreferences: {
      minSize: { type: Number, default: 2, min: 2, max: 5 },
      maxSize: { type: Number, default: 5, min: 2, max: 5 },
    },
  },
  { timestamps: true }
);

const Student: Model<IStudent> = mongoose.models.Student || mongoose.model<IStudent>('Student', StudentSchema);
export default Student;
