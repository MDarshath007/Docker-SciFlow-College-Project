const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const trainingRoutes = require("./routes/trainingRoutes");

dotenv.config();

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json({ limit: "10mb" }));

const JWT_SECRET = process.env.JWT_SECRET || "sciflow-dev-secret";
const PORT = process.env.PORT || 5000;

const DEFAULT_CODE = `// ============================================
// CANCER CELL DRUG EFFICIENCY ANALYZER
// For Dr. Priya's research on cancer treatments
// ============================================

/**
 * Calculate drug efficiency percentage
 * @param {number} beforeCount - Number of live cancer cells before treatment
 * @param {number} afterCount - Number of live cancer cells after treatment
 * @returns {number} Percentage of cancer cells killed
 */
function calculateDrugEfficiency(beforeCount, afterCount) {
    if (beforeCount <= 0) {
        return 0;
    }
    const killed = beforeCount - afterCount;
    return (killed / beforeCount) * 100;
}

/**
 * Analyze drug response for a group of samples
 * @param {Array} controlGroup - Array of before-treatment cell counts
 * @param {Array} treatedGroup - Array of after-treatment cell counts
 * @returns {Object} Analysis results with classification
 */
function analyzeDrugResponse(controlGroup, treatedGroup) {
    if (controlGroup.length !== treatedGroup.length) {
        return { error: "Groups must be same size" };
    }

    let efficiencies = [];
    for (let i = 0; i < controlGroup.length; i++) {
        let efficiency = calculateDrugEfficiency(controlGroup[i], treatedGroup[i]);
        efficiencies.push(efficiency);
    }

    let avgEfficiency = efficiencies.reduce((a,b) => a + b, 0) / efficiencies.length;

    let classification;
    if (avgEfficiency > 50) classification = "Highly Effective";
    else if (avgEfficiency > 25) classification = "Moderately Effective";
    else classification = "Not Effective";

    return {
        averageEfficiency: avgEfficiency.toFixed(2) + "%",
        classification: classification,
        individualEfficiencies: efficiencies
    };
}

/**
 * Process simulated microscope image data
 * @param {Array} imageData - Array of image objects with simulated cell counts
 * @returns {Array} Processed results with efficiency calculations
 */
function processImageBatch(imageData) {
    let results = [];
    for (let image of imageData) {
        let efficiency = calculateDrugEfficiency(image.beforeCount, image.afterCount);
        results.push({
            imageName: image.name,
            deadCells: image.beforeCount - image.afterCount,
            efficiency: efficiency.toFixed(2) + "%"
        });
    }
    return results;
}`;

const db = {
  users: [],
  projects: [],
};

global.__sciflowState = db;

function safeEmail(email = "") {
  return email.trim().toLowerCase();
}

function auth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid token" });
  }
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function buildQualityMetrics(code) {
  const lines = code.split("\n").filter((line) => line.trim().length > 0).length;
  const functionCount = (code.match(/function\s+\w+\s*\(/g) || []).length;
  const complexityTokens = (code.match(/\b(if|for|while|case|catch|\&\&|\|\|)\b/g) || []).length;
  const cyclomaticComplexity = Math.max(1, functionCount + complexityTokens);
  const maintainability = Math.max(0, Math.min(100, 100 - cyclomaticComplexity * 2 - Math.max(0, lines - 120) * 0.2));

  const suggestions = [];
  if (cyclomaticComplexity > 25) suggestions.push("This function set is too complex. Consider splitting logic.");
  if (lines > 220) suggestions.push("Code is getting lengthy. Extract helper modules.");
  if (functionCount < 2) suggestions.push("Add smaller reusable functions for clarity.");

  return {
    cyclomaticComplexity: Number(cyclomaticComplexity.toFixed(2)),
    linesOfCode: lines,
    numberOfFunctions: functionCount,
    maintainabilityScore: Number(maintainability.toFixed(2)),
    suggestions,
  };
}

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/api/auth/register", async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ message: "Name, email and password are required." });
  }

  const normalizedEmail = safeEmail(email);
  if (db.users.find((u) => u.email === normalizedEmail)) {
    return res.status(409).json({ message: "Email already registered." });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = { id: uuidv4(), email: normalizedEmail, name, hashedPassword };
  db.users.push(user);
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "7d" });
  res.status(201).json({ token, user: { id: user.id, email: user.email, name: user.name } });
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  const user = db.users.find((u) => u.email === safeEmail(email));
  if (!user) return res.status(401).json({ message: "Invalid credentials." });

  const isValid = await bcrypt.compare(password || "", user.hashedPassword);
  if (!isValid) return res.status(401).json({ message: "Invalid credentials." });

  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "7d" });
  res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
});

app.get("/api/auth/me", auth, (req, res) => {
  const user = db.users.find((u) => u.id === req.userId);
  if (!user) return res.status(404).json({ message: "User not found." });
  res.json({ id: user.id, email: user.email, name: user.name });
});

app.get("/api/projects", auth, (req, res) => {
  const projects = db.projects.filter((p) => p.userId === req.userId);
  res.json(projects);
});

app.post("/api/projects", auth, (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ message: "Project name is required." });
  const now = new Date().toISOString();
  const project = {
    id: uuidv4(),
    userId: req.userId,
    name,
    description: description || "",
    files: [],
    results: [],
    code: DEFAULT_CODE,
    versionHistory: [{ id: uuidv4(), timestamp: now, code: DEFAULT_CODE }],
    tests: [],
    snapshots: [],
    docs: [],
    qualityHistory: [],
    createdAt: now,
  };
  db.projects.push(project);
  res.status(201).json(project);
});

app.delete("/api/projects/:id", auth, (req, res) => {
  const idx = db.projects.findIndex((p) => p.id === req.params.id && p.userId === req.userId);
  if (idx < 0) return res.status(404).json({ message: "Project not found." });
  db.projects.splice(idx, 1);
  res.json({ message: "Project deleted." });
});

app.get("/api/projects/:id", auth, (req, res) => {
  const project = db.projects.find((p) => p.id === req.params.id && p.userId === req.userId);
  if (!project) return res.status(404).json({ message: "Project not found." });
  res.json(project);
});

app.post("/api/projects/:id/uploads", auth, upload.array("images"), (req, res) => {
  const project = db.projects.find((p) => p.id === req.params.id && p.userId === req.userId);
  if (!project) return res.status(404).json({ message: "Project not found." });

  const incoming = (req.files || []).map((file) => ({
    id: uuidv4(),
    name: file.originalname,
    type: file.mimetype,
    size: file.size,
    thumbnail: `data:${file.mimetype};base64,${file.buffer.toString("base64")}`,
    uploadedAt: new Date().toISOString(),
  }));
  project.files.push(...incoming);
  res.json({ files: incoming, total: project.files.length });
});

app.post("/api/projects/:id/process", auth, (req, res) => {
  const project = db.projects.find((p) => p.id === req.params.id && p.userId === req.userId);
  if (!project) return res.status(404).json({ message: "Project not found." });

  const results = project.files.map((file) => {
    const deadCells = randInt(50, 500);
    const totalCells = randInt(Math.max(deadCells + 5, 100), 700);
    const efficiency = (deadCells / totalCells) * 100;
    const drugName = `Drug-${randInt(1, 20)}`;
    return {
      id: uuidv4(),
      imageName: file.name,
      deadCells,
      totalCells,
      efficiency: Number(efficiency.toFixed(2)),
      drugName,
      processedAt: new Date().toISOString(),
    };
  });

  project.results = results;
  const averageEfficiency = results.length
    ? results.reduce((sum, r) => sum + r.efficiency, 0) / results.length
    : 0;
  const best = [...results].sort((a, b) => b.efficiency - a.efficiency)[0];

  res.json({
    results,
    summary: {
      bestDrug: best ? best.drugName : "N/A",
      averageEfficiency: Number(averageEfficiency.toFixed(2)),
      totalImagesProcessed: results.length,
    },
  });
});

app.post("/api/projects/:id/code", auth, (req, res) => {
  const project = db.projects.find((p) => p.id === req.params.id && p.userId === req.userId);
  if (!project) return res.status(404).json({ message: "Project not found." });
  const { code } = req.body;
  if (typeof code !== "string") return res.status(400).json({ message: "Code must be a string." });

  project.code = code;
  const version = { id: uuidv4(), timestamp: new Date().toISOString(), code };
  project.versionHistory.unshift(version);
  const quality = buildQualityMetrics(code);
  project.qualityHistory.unshift({ timestamp: version.timestamp, maintainabilityScore: quality.maintainabilityScore });
  res.json({ version, quality });
});

app.post("/api/projects/:id/revert/:versionId", auth, (req, res) => {
  const project = db.projects.find((p) => p.id === req.params.id && p.userId === req.userId);
  if (!project) return res.status(404).json({ message: "Project not found." });
  const version = project.versionHistory.find((v) => v.id === req.params.versionId);
  if (!version) return res.status(404).json({ message: "Version not found." });
  project.code = version.code;
  res.json({ code: project.code });
});

app.post("/api/projects/:id/tests", auth, (req, res) => {
  const project = db.projects.find((p) => p.id === req.params.id && p.userId === req.userId);
  if (!project) return res.status(404).json({ message: "Project not found." });
  const { functionName, args, expected } = req.body;
  const test = { id: uuidv4(), functionName, args, expected };
  project.tests.push(test);
  res.status(201).json(test);
});

app.delete("/api/projects/:id/tests/:testId", auth, (req, res) => {
  const project = db.projects.find((p) => p.id === req.params.id && p.userId === req.userId);
  if (!project) return res.status(404).json({ message: "Project not found." });
  project.tests = project.tests.filter((t) => t.id !== req.params.testId);
  res.json({ ok: true });
});

app.post("/api/projects/:id/run-tests", auth, (req, res) => {
  const project = db.projects.find((p) => p.id === req.params.id && p.userId === req.userId);
  if (!project) return res.status(404).json({ message: "Project not found." });

  const results = project.tests.map((test) => {
    try {
      const fn = new Function(`${project.code}; return ${test.functionName};`)();
      const actual = fn(...test.args);
      const passed = String(actual) === String(test.expected);
      return { ...test, passed, actual };
    } catch (error) {
      return { ...test, passed: false, actual: `Execution error: ${error.message}` };
    }
  });
  res.json(results);
});

app.post("/api/projects/:id/run-analysis", auth, (req, res) => {
  const project = db.projects.find((p) => p.id === req.params.id && p.userId === req.userId);
  if (!project) return res.status(404).json({ message: "Project not found." });
  const output = {
    message: "Analysis completed with current code on simulated data.",
    processedImages: project.files.length,
    sampleResult: project.results[0] || null,
    timestamp: new Date().toISOString(),
  };
  res.json(output);
});

app.post("/api/projects/:id/snapshots", auth, (req, res) => {
  const project = db.projects.find((p) => p.id === req.params.id && p.userId === req.userId);
  if (!project) return res.status(404).json({ message: "Project not found." });
  const snapshot = {
    id: uuidv4(),
    createdAt: new Date().toISOString(),
    code: project.code,
    files: project.files,
    results: project.results,
  };
  project.snapshots.unshift(snapshot);
  res.status(201).json(snapshot);
});

app.post("/api/projects/:id/reproduce/:snapshotId", auth, (req, res) => {
  const project = db.projects.find((p) => p.id === req.params.id && p.userId === req.userId);
  if (!project) return res.status(404).json({ message: "Project not found." });
  const snapshot = project.snapshots.find((s) => s.id === req.params.snapshotId);
  if (!snapshot) return res.status(404).json({ message: "Snapshot not found." });

  project.code = snapshot.code;
  project.files = snapshot.files;
  project.results = snapshot.results;
  res.json({ message: "Reproduced snapshot successfully.", snapshot });
});

app.post("/api/projects/:id/docs", auth, (req, res) => {
  const project = db.projects.find((p) => p.id === req.params.id && p.userId === req.userId);
  if (!project) return res.status(404).json({ message: "Project not found." });
  const { functionName, description } = req.body;
  const existing = project.docs.find((d) => d.functionName === functionName);
  if (existing) existing.description = description;
  else project.docs.push({ id: uuidv4(), functionName, description });
  res.json(project.docs);
});

app.get("/api/projects/:id/quality", auth, (req, res) => {
  const project = db.projects.find((p) => p.id === req.params.id && p.userId === req.userId);
  if (!project) return res.status(404).json({ message: "Project not found." });
  const current = buildQualityMetrics(project.code);
  res.json({ current, history: project.qualityHistory });
});

app.use("/api/training", trainingRoutes);

app.listen(PORT, () => {
  console.log(`SciFlow backend listening on port ${PORT}`);
});
