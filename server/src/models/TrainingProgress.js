const mongoose = require('mongoose');

const trainingProgressSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  task1_versionControl: { type: Boolean, default: false },
  task1_completedAt: { type: Date },
  task2_testing: { type: Boolean, default: false },
  task2_completedAt: { type: Date },
  task3_reproducibility: { type: Boolean, default: false },
  task3_completedAt: { type: Date },
  task4_documentation: { type: Boolean, default: false },
  task4_completedAt: { type: Date },
  workspaceUnlocked: { type: Boolean, default: false },
  unlockedAt: { type: Date },
  task1_changeCount: { type: Number, default: 0 },
  lastActivity: { type: Date, default: Date.now }
});

module.exports = mongoose.model('TrainingProgress', trainingProgressSchema);
