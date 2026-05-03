const mongoose = require("mongoose");

const codeFileSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    projectId: { type: String, required: true },
    code: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.models.CodeFile || mongoose.model("CodeFile", codeFileSchema);
