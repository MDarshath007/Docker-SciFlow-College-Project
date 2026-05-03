import Editor from "@monaco-editor/react";

function CodeEditor({ code, onChange, height = "250px" }) {
  return <Editor height={height} defaultLanguage="javascript" value={code} onChange={(value) => onChange?.(value || "")} />;
}

export default CodeEditor;
