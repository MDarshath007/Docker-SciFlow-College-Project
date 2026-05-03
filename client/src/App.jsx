import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import Editor from "@monaco-editor/react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import TrainingDashboard from "./components/Training/TrainingDashboard";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:5000/api";

const initialAuth = { email: "", password: "", name: "" };

function App() {
  const [token, setToken] = useState(localStorage.getItem("sciflowToken") || "");
  const [authForm, setAuthForm] = useState(initialAuth);
  const [isRegister, setIsRegister] = useState(true);
  const [user, setUser] = useState(null);
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [projectForm, setProjectForm] = useState({ name: "", description: "" });
  const [project, setProject] = useState(null);
  const [saveState, setSaveState] = useState("Saved");
  const [testForm, setTestForm] = useState({ functionName: "calculateDrugEfficiency", args: "100, 30", expected: "70" });
  const [testRunResults, setTestRunResults] = useState([]);
  const [analysisOutput, setAnalysisOutput] = useState(null);
  const [analysisData, setAnalysisData] = useState([]);
  const [progress, setProgress] = useState({ current: 0, total: 0, eta: 0, active: false });
  const [quality, setQuality] = useState(null);
  const [apiError, setApiError] = useState("");
  const [workspaceUnlocked, setWorkspaceUnlocked] = useState(true);
  const [task1ChangeCount, setTask1ChangeCount] = useState(0);
  const currentProjectId = project?.id;
  const currentProjectCode = project?.code;

  const client = useMemo(() => {
    const instance = axios.create({ baseURL: API });
    instance.interceptors.request.use((config) => {
      if (token) config.headers.Authorization = `Bearer ${token}`;
      return config;
    });
    return instance;
  }, [token]);

  const fetchQuality = useCallback(
    async (projectId) => {
      try {
        const { data } = await client.get(`/projects/${projectId}/quality`);
        setQuality(data);
        setApiError("");
      } catch {
        setApiError("Could not load quality metrics. Backend unavailable.");
      }
    },
    [client]
  );

  const logout = useCallback(() => {
    localStorage.removeItem("sciflowToken");
    setToken("");
    setUser(null);
    setProjects([]);
    setSelectedProjectId("");
    setProject(null);
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    (async () => {
      try {
        const [{ data: me }, { data: projectList }, { data: training }] = await Promise.all([
          client.get("/auth/me"),
          client.get("/projects"),
          client.get("/training/status"),
        ]);
        if (cancelled) return;
        setUser(me);
        setProjects(projectList);
        setWorkspaceUnlocked(Boolean(training.workspaceUnlocked));
        setApiError("");
      } catch (error) {
        if (cancelled) return;
        const status = error?.response?.status;
        if (status === 401 || status === 404) {
          logout();
          setApiError("Session expired. Please login again.");
          return;
        }
        setApiError("Backend not reachable. Start server on port 5000.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, client, logout]);

  async function refreshTrainingStatus() {
    try {
      const { data } = await client.get("/training/status");
      setWorkspaceUnlocked(Boolean(data.workspaceUnlocked));
    } catch {
      // no-op on connectivity glitches
    }
  }

  useEffect(() => {
    if (!selectedProjectId) return;
    client
      .get(`/projects/${selectedProjectId}`)
      .then(({ data }) => {
        setProject(data);
        setQuality(null);
        setApiError("");
        fetchQuality(data.id);
      })
      .catch(() => setApiError("Backend not reachable. Start server on port 5000."));
  }, [selectedProjectId, client, fetchQuality]);

  useEffect(() => {
    if (!currentProjectId || !currentProjectCode) return;
    const timer = setTimeout(async () => {
      try {
        const { data } = await client.post(`/projects/${currentProjectId}/code`, { code: currentProjectCode });
        setProject((prev) => ({ ...prev, versionHistory: [data.version, ...prev.versionHistory] }));
        setQuality((prev) => ({ ...(prev || {}), current: data.quality }));
        setSaveState("Saved ✓");
        setApiError("");
      } catch {
        setSaveState("Save failed");
        setApiError("Autosave failed: backend not reachable.");
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [currentProjectCode, currentProjectId, client]);

  async function handleAuth(e) {
    e.preventDefault();
    const path = isRegister ? "/auth/register" : "/auth/login";
    try {
      const { data } = await client.post(path, authForm);
      localStorage.setItem("sciflowToken", data.token);
      setToken(data.token);
      setApiError("");
    } catch {
      setApiError("Authentication failed. Ensure backend is running on port 5000.");
    }
  }

  async function createProject(e) {
    e.preventDefault();
    const { data } = await client.post("/projects", projectForm);
    setProjectForm({ name: "", description: "" });
    setProjects((prev) => [data, ...prev]);
  }

  async function removeProject(id) {
    await client.delete(`/projects/${id}`);
    setProjects((prev) => prev.filter((p) => p.id !== id));
    if (selectedProjectId === id) {
      setSelectedProjectId("");
      setProject(null);
    }
  }

  async function uploadFiles(fileList) {
    if (!project) return;
    const fd = new FormData();
    [...fileList].forEach((file) => fd.append("images", file));
    const { data } = await client.post(`/projects/${project.id}/uploads`, fd, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    setProject((prev) => ({ ...prev, files: [...prev.files, ...data.files] }));
  }

  async function processImages() {
    if (!project || project.files.length === 0) return;
    setProgress({ current: 0, total: project.files.length, eta: project.files.length / 25, active: true });
    let current = 0;
    const timer = setInterval(() => {
      current += 100;
      const bounded = Math.min(current, project.files.length);
      setProgress({ current: bounded, total: project.files.length, eta: Math.max(0, (project.files.length - bounded) / 25), active: true });
    }, 400);
    const { data } = await client.post(`/projects/${project.id}/process`);
    clearInterval(timer);
    setProgress({ current: project.files.length, total: project.files.length, eta: 0, active: false });
    setProject((prev) => ({ ...prev, results: data.results }));
    setAnalysisData(data.results);
  }

  async function addTest() {
    const payload = {
      functionName: testForm.functionName,
      args: JSON.parse(`[${testForm.args}]`),
      expected: Number.isNaN(Number(testForm.expected)) ? testForm.expected : Number(testForm.expected),
    };
    const { data } = await client.post(`/projects/${project.id}/tests`, payload);
    setProject((prev) => ({ ...prev, tests: [...prev.tests, data] }));
    await client.post("/training/task2/complete").catch(() => {});
    refreshTrainingStatus();
  }

  async function runTests() {
    const { data } = await client.post(`/projects/${project.id}/run-tests`);
    setTestRunResults(data);
  }

  async function saveSnapshot() {
    const { data } = await client.post(`/projects/${project.id}/snapshots`);
    setProject((prev) => ({ ...prev, snapshots: [data, ...prev.snapshots] }));
    await client.post("/training/task3/complete").catch(() => {});
    refreshTrainingStatus();
  }

  async function reproduce(snapshotId) {
    const { data } = await client.post(`/projects/${project.id}/reproduce/${snapshotId}`);
    setProject((prev) => ({ ...prev, code: data.snapshot.code, files: data.snapshot.files, results: data.snapshot.results }));
    setAnalysisData(data.snapshot.results || []);
  }

  async function runAnalysis() {
    const dataToUse = analysisData.length ? analysisData : project.results;
    setAnalysisData(dataToUse);
    setAnalysisOutput({
      message: "analysisData is ready in runtime. Click 'Run Code on Data' to execute your code.",
      rows: dataToUse.length,
      preview: dataToUse[0] || null,
      timestamp: new Date().toISOString(),
    });
  }

  function runCodeOnData() {
    try {
      const dataToUse = analysisData.length ? analysisData : project.results;
      const runner = new Function(`
        const analysisData = arguments[0];
        ${project.code}
        if (typeof findBestDrug === "function") {
          return findBestDrug(analysisData);
        }
        if (typeof runAnalysis === "function") {
          return runAnalysis(analysisData);
        }
        return {
          message: "No findBestDrug(analysisData) or runAnalysis(analysisData) function found.",
          sample: analysisData[0] || null
        };
      `);
      const output = runner(dataToUse);
      setAnalysisOutput({
        mode: "Run Code on Data",
        analysisDataCount: dataToUse.length,
        output,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      setAnalysisOutput({
        mode: "Run Code on Data",
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  async function addDoc(functionName) {
    const description = window.prompt(`What does ${functionName} do?`);
    if (!description) return;
    const { data } = await client.post(`/projects/${project.id}/docs`, { functionName, description });
    setProject((prev) => ({ ...prev, docs: data }));
    await client.post("/training/task4/complete").catch(() => {});
    refreshTrainingStatus();
  }

  if (!token) {
    return (
      <main className="container">
        <h1>SciFlow - Smart Research Workflow Manager</h1>
        <form className="card" onSubmit={handleAuth}>
          <h2>{isRegister ? "Register" : "Login"}</h2>
          {isRegister && <input placeholder="Name" value={authForm.name} onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })} required />}
          <input placeholder="Email" type="email" value={authForm.email} onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })} required />
          <input placeholder="Password" type="password" value={authForm.password} onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })} required />
          <button type="submit">{isRegister ? "Create account" : "Login"}</button>
          <button type="button" onClick={() => setIsRegister(!isRegister)}>{isRegister ? "Already have account?" : "Need an account?"}</button>
        </form>
      </main>
    );
  }

  if (token && !workspaceUnlocked) {
    return <TrainingDashboard client={client} onUnlocked={refreshTrainingStatus} />;
  }

  return (
    <main className="container">
      <header className="header">
        <h1>SciFlow</h1>
        <div>{user?.name} <button onClick={logout}>Logout</button></div>
      </header>
      {apiError && <div className="card bad">{apiError}</div>}

      <section className="grid2">
        <div className="card">
          <h2>Projects</h2>
          <form onSubmit={createProject}>
            <input placeholder="Project name" value={projectForm.name} onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })} required />
            <input placeholder="Description" value={projectForm.description} onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })} />
            <button type="submit">Create</button>
          </form>
          {projects.map((p) => (
            <div key={p.id} className="row">
              <button onClick={() => setSelectedProjectId(p.id)}>{p.name}</button>
              <button onClick={() => removeProject(p.id)}>Delete</button>
            </div>
          ))}
        </div>

        {project && (
          <div className="card">
            <h2>{project.name}</h2>
            <p>{project.description}</p>
            <input type="file" multiple accept=".png,.jpg,.jpeg,.tif,.tiff" onChange={(e) => uploadFiles(e.target.files)} />
            <p>{project.files.length.toLocaleString()} images ready for processing</p>
            <button onClick={processImages}>Process Images</button>
            {progress.total > 0 && (
              <p>Processing image {progress.current}/{progress.total}... ETA {progress.eta.toFixed(1)}s</p>
            )}
            <div className="thumbs">{project.files.slice(0, 20).map((f) => <img key={f.id} src={f.thumbnail} alt={f.name} title={f.name} />)}</div>
          </div>
        )}
      </section>

      {project && (
        <>
          <section className="card">
            <h2>Results</h2>
            <div className="tableWrap">
              <table>
                <thead><tr><th>Image</th><th>Dead Cells</th><th>Total Cells</th><th>Efficiency %</th><th>Drug</th></tr></thead>
                <tbody>{project.results.map((r) => <tr key={r.id}><td>{r.imageName}</td><td>{r.deadCells}</td><td>{r.totalCells}</td><td>{r.efficiency}</td><td>{r.drugName}</td></tr>)}</tbody>
              </table>
            </div>
            <p><b>analysisData rows:</b> {(analysisData.length || project.results.length)}</p>
            <button onClick={() => {
              const csv = ["Image Name,Dead Cells,Total Cells,Efficiency %,Drug", ...project.results.map((r) => `${r.imageName},${r.deadCells},${r.totalCells},${r.efficiency},${r.drugName}`)].join("\n");
              const blob = new Blob([csv], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `${project.name}-results.csv`;
              a.click();
              URL.revokeObjectURL(url);
            }}>Export CSV</button>
            <div style={{ width: "100%", height: 300 }}>
              <ResponsiveContainer>
                <BarChart data={Object.values(project.results.reduce((acc, item) => {
                  acc[item.drugName] = acc[item.drugName] || { drugName: item.drugName, avg: 0, count: 0 };
                  acc[item.drugName].avg += item.efficiency;
                  acc[item.drugName].count += 1;
                  return acc;
                }, {})).map((d) => ({ drugName: d.drugName, efficiency: Number((d.avg / d.count).toFixed(2)) })).sort((a, b) => b.efficiency - a.efficiency).slice(0, 10)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="drugName" /><YAxis /><Tooltip />
                  <Bar dataKey="efficiency" fill="#5b7cff" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="grid2">
            <div className="card">
              <h2>Code Editor</h2>
              <p>{saveState}</p>
              <Editor
                height="350px"
                defaultLanguage="javascript"
                value={project.code}
                onChange={(v) => {
                  const nextCount = task1ChangeCount + 1;
                  setTask1ChangeCount(nextCount);
                  client.post("/training/task1/update", { changeCount: nextCount }).catch(() => {});
                  setSaveState("Typing...");
                  setProject((prev) => ({ ...prev, code: v || "" }));
                }}
              />
              <button onClick={() => {
                const fnNames = [...new Set((project.code.match(/function\s+([A-Za-z0-9_]+)/g) || []).map((m) => m.split(" ")[1]))];
                fnNames.forEach((name) => addDoc(name));
              }}>Prompt Documentation</button>
              <h3>Version History</h3>
              <div className="list">{project.versionHistory.slice(0, 15).map((v) => <button key={v.id} onClick={async () => {
                const { data } = await client.post(`/projects/${project.id}/revert/${v.id}`);
                setProject((prev) => ({ ...prev, code: data.code }));
              }}>{new Date(v.timestamp).toLocaleString()}</button>)}</div>
            </div>

            <div className="card">
              <h2>Tests</h2>
              <input value={testForm.functionName} onChange={(e) => setTestForm({ ...testForm, functionName: e.target.value })} placeholder="Function name" />
              <input value={testForm.args} onChange={(e) => setTestForm({ ...testForm, args: e.target.value })} placeholder="Args e.g. 100, 30" />
              <input value={testForm.expected} onChange={(e) => setTestForm({ ...testForm, expected: e.target.value })} placeholder="Expected result" />
              <button onClick={addTest}>Add test</button>
              <button onClick={runTests}>Run Tests</button>
              {project.tests.map((t) => <div key={t.id} className="row"><span>{t.functionName}({t.args.join(",")}) = {String(t.expected)}</span><button onClick={async () => {
                await client.delete(`/projects/${project.id}/tests/${t.id}`);
                setProject((prev) => ({ ...prev, tests: prev.tests.filter((x) => x.id !== t.id) }));
              }}>Delete</button></div>)}
              {testRunResults.map((r) => <p key={r.id} className={r.passed ? "ok" : "bad"}>{r.passed ? "✅ PASSED" : `❌ FAILED Expected ${r.expected}, got ${r.actual}`}</p>)}
            </div>
          </section>

          <section className="grid2">
            <div className="card">
              <h2>Reproducibility</h2>
              <button onClick={runAnalysis}>Run Analysis</button>
              <button onClick={runCodeOnData}>Run Code on Data</button>
              <button onClick={saveSnapshot}>Save Snapshot</button>
              {analysisOutput && <pre>{JSON.stringify(analysisOutput, null, 2)}</pre>}
              <h3>Snapshots</h3>
              {project.snapshots.map((s) => <button key={s.id} onClick={() => reproduce(s.id)}>Reproduce {new Date(s.createdAt).toLocaleString()}</button>)}
            </div>
            <div className="card">
              <h2>Code Quality + Docs</h2>
              {quality?.current && (
                <>
                  <p>Complexity: {quality.current.cyclomaticComplexity}</p>
                  <p>Lines: {quality.current.linesOfCode}</p>
                  <p>Functions: {quality.current.numberOfFunctions}</p>
                  <p>Maintainability: {quality.current.maintainabilityScore}/100</p>
                  {quality.current.suggestions.map((s) => <p key={s}>- {s}</p>)}
                </>
              )}
              <h3>History</h3>
              <div style={{ width: "100%", height: 200 }}>
                <ResponsiveContainer>
                  <BarChart data={quality?.history || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="timestamp" hide />
                    <YAxis domain={[0, 100]} />
                    <Tooltip />
                    <Bar dataKey="maintainabilityScore" fill="#00a86b" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <h3>Documentation Panel</h3>
              {(project.docs || []).map((d) => <p key={d.id}><b>{d.functionName}:</b> {d.description}</p>)}
            </div>
          </section>
        </>
      )}
    </main>
  );
}

export default App;
