const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const TrainingProgress = require("../models/TrainingProgress");
const CodeFile = require("../models/CodeFile");
const Test = require("../models/Test");

const inMemoryProgress = new Map();

function defaultProgress(userId) {
  return {
    userId,
    task1_versionControl: false,
    task1_completedAt: null,
    task2_testing: false,
    task2_completedAt: null,
    task3_reproducibility: false,
    task3_completedAt: null,
    task4_documentation: false,
    task4_completedAt: null,
    workspaceUnlocked: false,
    unlockedAt: null,
    task1_changeCount: 0,
    lastActivity: new Date(),
  };
}

function getOrCreateProgress(userId) {
  if (!inMemoryProgress.has(userId)) {
    inMemoryProgress.set(userId, defaultProgress(userId));
  }
  return inMemoryProgress.get(userId);
}

function applyExistingUserBypass(progress, userId) {
  const state = global.__sciflowState;
  const hasExistingProjects = Boolean(state?.projects?.some((p) => p.userId === userId));
  if (hasExistingProjects && !progress.workspaceUnlocked) {
    const now = new Date();
    progress.task1_versionControl = true;
    progress.task2_testing = true;
    progress.task3_reproducibility = true;
    progress.task4_documentation = true;
    progress.task1_completedAt = progress.task1_completedAt || now;
    progress.task2_completedAt = progress.task2_completedAt || now;
    progress.task3_completedAt = progress.task3_completedAt || now;
    progress.task4_completedAt = progress.task4_completedAt || now;
    progress.workspaceUnlocked = true;
    progress.unlockedAt = progress.unlockedAt || now;
  }
}

// Touch references so linter/runtime keeps requested imports.
void TrainingProgress;
void CodeFile;
void Test;

// Get user's training progress
router.get("/progress", auth, async (req, res) => {
  try {
    const progress = getOrCreateProgress(req.userId);
    applyExistingUserBypass(progress, req.userId);
    res.json(progress);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update Task 1: Version Control (track code changes)
router.post("/task1/update", auth, async (req, res) => {
  try {
    const { changeCount } = req.body;
    const progress = getOrCreateProgress(req.userId);
    progress.task1_changeCount = changeCount;
    if (changeCount >= 3 && !progress.task1_versionControl) {
      progress.task1_versionControl = true;
      progress.task1_completedAt = new Date();
    }
    progress.lastActivity = new Date();
    res.json({ task1_completed: progress.task1_versionControl, changeCount: progress.task1_changeCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update Task 2: Testing
router.post("/task2/complete", auth, async (req, res) => {
  try {
    const progress = getOrCreateProgress(req.userId);
    if (!progress.task2_testing) {
      progress.task2_testing = true;
      progress.task2_completedAt = new Date();
      progress.lastActivity = new Date();
    }
    res.json({ task2_completed: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update Task 3: Reproducibility
router.post("/task3/complete", auth, async (req, res) => {
  try {
    const progress = getOrCreateProgress(req.userId);
    if (!progress.task3_reproducibility) {
      progress.task3_reproducibility = true;
      progress.task3_completedAt = new Date();
      progress.lastActivity = new Date();
    }
    res.json({ task3_completed: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update Task 4: Documentation
router.post("/task4/complete", auth, async (req, res) => {
  try {
    const progress = getOrCreateProgress(req.userId);
    if (!progress.task4_documentation) {
      progress.task4_documentation = true;
      progress.task4_completedAt = new Date();
      progress.lastActivity = new Date();
    }
    res.json({ task4_completed: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Unlock workspace (called when all tasks complete)
router.post("/unlock", auth, async (req, res) => {
  try {
    const progress = getOrCreateProgress(req.userId);
    const allTasksComplete =
      progress.task1_versionControl &&
      progress.task2_testing &&
      progress.task3_reproducibility &&
      progress.task4_documentation;

    if (allTasksComplete && !progress.workspaceUnlocked) {
      progress.workspaceUnlocked = true;
      progress.unlockedAt = new Date();
      progress.lastActivity = new Date();
    }

    res.json({ workspaceUnlocked: progress.workspaceUnlocked });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get training status
router.get("/status", auth, async (req, res) => {
  try {
    const progress = getOrCreateProgress(req.userId);
    applyExistingUserBypass(progress, req.userId);
    const allTasksComplete =
      progress.task1_versionControl &&
      progress.task2_testing &&
      progress.task3_reproducibility &&
      progress.task4_documentation;

    res.json({
      task1_completed: progress.task1_versionControl,
      task2_completed: progress.task2_testing,
      task3_completed: progress.task3_reproducibility,
      task4_completed: progress.task4_documentation,
      allTasksComplete,
      workspaceUnlocked: progress.workspaceUnlocked,
      task1_changeCount: progress.task1_changeCount,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
