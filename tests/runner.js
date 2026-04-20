const root = document.getElementById("results");

function line(text, className = "") {
  const node = document.createElement("div");
  node.className = className;
  node.textContent = text;
  root.appendChild(node);
}

async function runModule(path) {
  const started = performance.now();
  try {
    await import(path);
    line(`PASS ${path} (${Math.round(performance.now() - started)}ms)`, "ok");
    return true;
  } catch (error) {
    line(`FAIL ${path}`, "error");
    line(String(error.stack || error.message || error), "small");
    return false;
  }
}

const modules = [
  "./passwords.test.mjs",
  "./imports.test.mjs",
  "./validation.test.mjs",
];

let passed = 0;
for (const modulePath of modules) {
  if (await runModule(modulePath)) passed += 1;
}

line(`${passed}/${modules.length} test modules passed.`, passed === modules.length ? "ok" : "error");

