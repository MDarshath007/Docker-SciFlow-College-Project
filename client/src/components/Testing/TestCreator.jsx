import { useState } from "react";

function TestCreator({ onTestCreated, functionName = "multiply" }) {
  const [args, setArgs] = useState("2,3");
  const [expected, setExpected] = useState("6");

  return (
    <div>
      <input value={args} onChange={(e) => setArgs(e.target.value)} placeholder="Arguments e.g. 2,3" />
      <input value={expected} onChange={(e) => setExpected(e.target.value)} placeholder="Expected output" />
      <button
        onClick={() =>
          onTestCreated?.({
            functionName,
            args: args.split(",").map((x) => x.trim()),
            expected,
          })
        }
      >
        Create Test
      </button>
    </div>
  );
}

export default TestCreator;
