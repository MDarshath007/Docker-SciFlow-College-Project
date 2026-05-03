const mongoose = require("mongoose");

const testSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    projectId: { type: String, required: true },
    functionName: { type: String, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Test || mongoose.model("Test", testSchema);
