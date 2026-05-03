import { useCallback, useEffect, useState } from "react";
import CodeEditor from "../CodeEditor/CodeEditor";
import TestCreator from "../Testing/TestCreator";

function TrainingDashboard({ client, onUnlocked }) {
  const [progress, setProgress] = useState(null);
  const [task1Code, setTask1Code] = useState(`// Task 1: Make 3 changes to this code
// Change 1: Modify this comment
function sayHello() {
    return "Hello";
}

// Change 2: Add a new function
// Change 3: Modify the return value above
`);
  const [task1ChangeCount, setTask1ChangeCount] = useState(0);

  const fetchProgress = useCallback(async () => {
    try {
      const { data } = await client.get("/training/status");
      setProgress(data);
      if (data.workspaceUnlocked) onUnlocked?.();
    } catch {
      // no-op for transient network issue
    }
  }, [client, onUnlocked]);

  useEffect(() => {
    (async () => {
      await fetchProgress();
    })();
  }, [fetchProgress]);

  async function handleTask1CodeChange(newCode) {
    setTask1Code(newCode);
    const newCount = task1ChangeCount + 1;
    setTask1ChangeCount(newCount);
    await client.post("/training/task1/update", { changeCount: newCount });
    fetchProgress();
  }

  async function handleTask2Complete() {
    await client.post("/training/task2/complete");
    fetchProgress();
  }

  async function handleTask3Complete() {
    await client.post("/training/task3/complete");
    fetchProgress();
  }

  async function handleTask4Complete() {
    await client.post("/training/task4/complete");
    fetchProgress();
  }

  async function handleUnlock() {
    await client.post("/training/unlock");
    onUnlocked?.();
  }

  function calculateProgress() {
    if (!progress) return 0;
    let completed = 0;
    if (progress.task1_completed) completed++;
    if (progress.task2_completed) completed++;
    if (progress.task3_completed) completed++;
    if (progress.task4_completed) completed++;
    return (completed / 4) * 100;
  }

  return (
    <main className="container">
      <h1>SciFlow Training</h1>
      <p>Complete these 4 tasks to unlock your workspace.</p>
      <div className="card">
        <p>
          <b>Training Progress:</b> {calculateProgress()}%
        </p>
      </div>

      <section className="card">
        <h2>Task 1: Version Control</h2>
        {progress?.task1_completed && <p className="ok">Completed</p>}
        <CodeEditor code={task1Code} onChange={handleTask1CodeChange} height="260px" />
        <p>Changes made: {task1ChangeCount} / 3 needed</p>
      </section>

      <section className="card">
        <h2>Task 2: Create a Test</h2>
        {progress?.task2_completed && <p className="ok">Completed</p>}
        <p>function multiply(a, b) {"{ return a * b; }"}</p>
        <TestCreator functionName="multiply" onTestCreated={handleTask2Complete} />
      </section>

      <section className="card">
        <h2>Task 3: Save and Reproduce</h2>
        {progress?.task3_completed && <p className="ok">Completed</p>}
        <button onClick={handleTask3Complete}>Save Snapshot</button>
      </section>

      <section className="card">
        <h2>Task 4: Add Documentation</h2>
        {progress?.task4_completed && <p className="ok">Completed</p>}
        <button onClick={handleTask4Complete}>Save Documentation</button>
      </section>

      {progress?.allTasksComplete && !progress?.workspaceUnlocked && (
        <section className="card">
          <p>Congratulations! You completed all training tasks.</p>
          <button onClick={handleUnlock}>Unlock Workspace</button>
        </section>
      )}
    </main>
  );
}

export default TrainingDashboard;
